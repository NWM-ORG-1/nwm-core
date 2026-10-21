"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BEATS } from "@/lib/beats";
import { markRead, setQueue, type Queue } from "@/lib/client/reading";
import { readTimeLabel } from "@/lib/content/meta";
import { useReadHistory } from "@/lib/client/reading";
import type { Beat } from "@/db/schema";
import { beatDotClass } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { beacon, useReaderQueue } from "./useReaderQueue";

interface ReaderProps {
  slug: string;
  beat: Beat;
  tags: string[];
  readSeconds: number;
  fallback: Queue;
}

/* ───────────────────────── swipe + keys + tracking ───────────────────────── */

/**
 * Wraps the article body. Horizontal swipe (touch) or J/K/←/→ moves through the
 * reading queue; dwell + reaching the end mark the piece as read on-device.
 */
export function ReaderShell({ slug, beat, tags, readSeconds, fallback, children }: ReaderProps & { children: ReactNode }) {
  const router = useRouter();
  const { prev, next } = useReaderQueue(slug, fallback);
  const areaRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dwellRef = useRef({ ms: 0, since: 0, done: false, counted: false });

  const go = useCallback(
    (dir: "next" | "prev") => {
      const target = dir === "next" ? next : prev;
      if (!target) {
        setToast(dir === "next" ? "목록의 마지막 기사입니다" : "목록의 첫 기사입니다");
        return;
      }
      if (dir === "next") beacon(slug, "next");
      router.push(`/a/${target.s}`, { transitionTypes: [dir] });
    },
    [next, prev, router, slug],
  );

  // keyboard — layout effect so keys work the instant the page commits
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowRight") {
        e.preventDefault();
        go("next");
      } else if (e.key === "k" || e.key === "ArrowLeft") {
        e.preventDefault();
        go("prev");
      } else if (e.key === "s") {
        e.preventDefault();
        navigator.clipboard?.writeText(window.location.href).then(() => setToast("링크를 복사했습니다"));
      } else if (e.key === "?") {
        window.dispatchEvent(new Event("nwm:search"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // swipe (touch only; vertical scroll stays native via touch-action: pan-y)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let active = false;
    let locked: "x" | "y" | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-noswipe],a,button,input,textarea,select")) return;
      if (e.clientX < 24 || e.clientX > window.innerWidth - 24) return; // OS edge gestures
      x0 = e.clientX;
      y0 = e.clientY;
      active = true;
      locked = null;
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!locked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) locked = Math.abs(dx) > Math.abs(dy) * 1.7 ? "x" : "y";
      if (locked === "x") el.style.transform = `translate3d(${dx * 0.35}px,0,0)`;
    };
    const up = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      el.style.transition = "transform 220ms cubic-bezier(.16,1,.3,1)";
      el.style.transform = "";
      setTimeout(() => (el.style.transition = ""), 240);
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      const angleOk = Math.abs(dy) < Math.abs(dx) * Math.tan((30 * Math.PI) / 180);
      if (locked === "x" && angleOk && Math.abs(dx) > 64 && !window.getSelection()?.toString()) go(dx < 0 ? "next" : "prev");
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [go]);

  // view beacon + dwell + end-of-article → read
  useEffect(() => {
    const d = dwellRef.current;
    if (!d.counted) {
      beacon(slug, "view");
      d.counted = true;
    }
    d.since = document.visibilityState === "visible" ? performance.now() : 0;
    const flush = (done = false) => {
      if (d.since) {
        d.ms += performance.now() - d.since;
        d.since = document.visibilityState === "visible" ? performance.now() : 0;
      }
      const seconds = d.ms / 1000;
      if (done || seconds >= Math.min(10, readSeconds * 0.5)) {
        markRead(slug, { beat, tags, dwell: seconds, expect: readSeconds, done: done || d.done });
      }
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
      else d.since = performance.now();
    };
    const timer = setInterval(() => flush(), 5000);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting) && !d.done) {
          d.done = true;
          flush(true);
          beacon(slug, "read", d.ms);
        }
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    if (endRef.current) io.observe(endRef.current);
    // A fast scroll (or End key) can jump past the sentinel without an intersection event.
    let raf = 0;
    const onScroll = () => {
      if (d.done || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = endRef.current;
        if (!el || d.done || document.visibilityState !== "visible") return;
        if (el.getBoundingClientRect().top < window.innerHeight * 0.85) {
          d.done = true;
          flush(true);
          beacon(slug, "read", d.ms);
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    return () => {
      flush();
      clearInterval(timer);
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [slug, beat, tags, readSeconds]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div ref={areaRef} className="touch-pan-y will-change-transform">
      {children}
      <div ref={endRef} aria-hidden="true" className="h-px" />
      {toast && (
        <div role="status" className="animate-rise fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line-2 bg-bg-1 px-4 py-2 text-[13px] text-fg shadow-[var(--shadow-pop)]">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── bottom dock ───────────────────────── */

export function ReaderDock({ slug, fallback }: { slug: string; fallback: Queue }) {
  const { queue, index, prev, next } = useReaderQueue(slug, fallback);
  const total = queue.items.length;
  return (
    <nav
      aria-label="이전·다음 기사"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[color-mix(in_srgb,var(--bg)_86%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      style={{ viewTransitionName: "reader-dock" }}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-2 px-3 sm:px-6">
        {prev ? (
          <Link
            href={`/a/${prev.s}`}
            prefetch={true}
            transitionTypes={["prev"]}
            aria-label={`이전 기사: ${prev.t}`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-fg-2 hover:border-line-2 hover:text-fg"
          >
            <Icon name="chevronLeft" size={18} />
          </Link>
        ) : (
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-line text-fg-4 opacity-40" aria-hidden="true">
            <Icon name="chevronLeft" size={18} />
          </span>
        )}

        <div className="min-w-0 flex-1 px-1">
          <p className="kicker flex items-center gap-2 text-fg-4">
            <span className="tabular">
              {index + 1}/{total}
            </span>
            <span className="truncate">{queue.label}</span>
            <span className="hidden sm:inline">· J/K 또는 스와이프</span>
          </p>
          {next ? (
            <Link href={`/a/${next.s}`} prefetch={true} transitionTypes={["next"]} className="mt-1 block truncate text-[14px] font-semibold text-fg hover:text-ice-2">
              다음 · {next.t}
            </Link>
          ) : (
            <p className="mt-1 truncate text-[14px] text-fg-3">목록의 마지막 기사입니다</p>
          )}
        </div>

        {next ? (
          <Link
            href={`/a/${next.s}`}
            prefetch={true}
            transitionTypes={["next"]}
            onClick={() => beacon(slug, "next")}
            aria-label={`다음 기사: ${next.t}`}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-ice px-4 text-[14px] font-bold text-bg hover:bg-ice-2"
          >
            다음
            <Icon name="chevronRight" size={16} />
          </Link>
        ) : (
          <Link href="/latest" className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-2 px-4 text-[14px] font-semibold text-fg-2 hover:text-fg">
            최신 기사
          </Link>
        )}
      </div>
    </nav>
  );
}

/* ───────────────────────── desktop queue rail ───────────────────────── */

export function QueueRail({ slug, fallback }: { slug: string; fallback: Queue }) {
  const { queue, index } = useReaderQueue(slug, fallback);
  const history = useReadHistory();
  const start = Math.max(0, index - 2);
  const items = queue.items.slice(start, start + 10);
  return (
    <section aria-labelledby="queue-h">
      <h2 id="queue-h" className="kicker mb-3 flex items-center justify-between text-fg-3">
        <span>다음 읽을 기사</span>
        <span className="tabular text-fg-4">
          {index + 1}/{queue.items.length}
        </span>
      </h2>
      <p className="mb-3 truncate text-[12px] text-fg-4">{queue.label}</p>
      <ol className="space-y-1">
        {items.map((it, i) => {
          const pos = start + i;
          const current = it.s === slug;
          const read = Boolean(history[it.s]);
          return (
            <li key={it.s}>
              <Link
                href={`/a/${it.s}`}
                prefetch={pos === index + 1 ? true : undefined}
                transitionTypes={[pos > index ? "next" : "prev"]}
                aria-current={current ? "page" : undefined}
                onClick={() => setQueue(queue)}
                className={`group flex gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${current ? "bg-bg-2" : "hover:bg-bg-2/70"}`}
              >
                <span className={`mt-[7px] size-1.5 shrink-0 rounded-full ${current ? "bg-ice" : beatDotClass(it.b as Beat)}`} aria-hidden="true" />
                <span className={`min-w-0 text-[13.5px] leading-snug ${current ? "font-bold text-fg" : read ? "text-fg-4" : "text-fg-2 group-hover:text-fg"}`}>
                  <span className="line-clamp-2">{it.t}</span>
                  {it.r && !current ? <span className="mt-0.5 block text-[11px] text-fg-4">{BEATS[it.b as Beat]?.label} · {readTimeLabel(it.r)}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ───────────────────────── end-of-article card ───────────────────────── */

export function NextUp({ slug, fallback }: { slug: string; fallback: Queue }) {
  const { next, queue, index } = useReaderQueue(slug, fallback);
  if (!next) {
    return (
      <div className="panel brackets p-6 text-center">
        <p className="text-[15px] font-semibold text-fg">‘{queue.label}’ 목록을 다 읽었어요.</p>
        <Link href="/" className="mt-3 inline-block text-[14px] text-ice hover:underline">
          홈으로 →
        </Link>
      </div>
    );
  }
  return (
    <Link
      href={`/a/${next.s}`}
      prefetch={true}
      transitionTypes={["next"]}
      onClick={() => beacon(slug, "next")}
      className="panel brackets group block p-6 transition-colors hover:border-line-2"
    >
      <p className="kicker flex items-center gap-2 text-ice">
        다음 기사
        <span className="text-fg-4">
          · {index + 2}/{queue.items.length} {queue.label}
        </span>
      </p>
      <p className="mt-2.5 text-[21px] font-bold leading-snug tracking-[-0.02em] text-fg group-hover:text-ice-2">{next.t}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-fg-3">
        계속 읽기 <Icon name="arrowRight" size={14} />
      </p>
    </Link>
  );
}
