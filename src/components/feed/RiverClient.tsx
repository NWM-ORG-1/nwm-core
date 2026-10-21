"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Beat } from "@/db/schema";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { refreshPulse, usePulse } from "@/lib/client/pulse";
import { useLastVisit, useReadHistory } from "@/lib/client/reading";
import { readTimeLabel } from "@/lib/content/meta";
import { clockKST, dateKST, ymdKST } from "@/lib/format";
import { AI_LABEL } from "@/lib/labels";
import { beatDotClass, beatTextClass } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { IntentLink } from "./IntentLink";
import { QueueScope } from "./QueueScope";
import type { MiniCard } from "./types";

const noop = () => () => {};

/**
 * The live river: reverse-chronological stream with day dividers, read state,
 * a "since your last visit" divider, an all-caught-up marker, new-arrival pill
 * (from /api/pulse) and j/k keyboard navigation.
 */
export function RiverClient({
  cards,
  ctx,
  label,
  live = false,
  filterable = false,
  showBeat = true,
  dayHeaders = true,
  headingLevel = 3,
}: {
  cards: MiniCard[];
  ctx: string;
  label: string;
  live?: boolean;
  filterable?: boolean;
  showBeat?: boolean;
  dayHeaders?: boolean;
  /** 2 on pages with no section heading between the page title and the rows. */
  headingLevel?: 2 | 3;
}) {
  const router = useRouter();
  const history = useReadHistory();
  const lastVisit = useLastVisit();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const pulse = usePulse();
  const [beat, setBeat] = useState<Beat | "all">("all");
  const [cursor, setCursor] = useState(-1);
  const listRef = useRef<HTMLOListElement>(null);

  const visible = useMemo(() => (beat === "all" ? cards : cards.filter((c) => c.b === beat)), [cards, beat]);
  const queueItems = useMemo(() => visible.map((c) => ({ s: c.s, t: c.t, b: c.b, r: c.r })), [visible]);

  // New arrivals: newest headlines in the pulse that this (static) page doesn't have yet.
  const newest = cards[0]?.p ?? "";
  const known = useMemo(() => new Set(cards.map((c) => c.s)), [cards]);
  const fresh = live && pulse ? pulse.latest.filter((x) => !known.has(x.s) && x.p > newest) : [];

  // "Since your last visit" — only meaningful after hydration and on a return visit.
  // -1 means every row is newer than the last visit (the list is capped, so "or more").
  const sinceIdx = mounted && lastVisit > 0 ? visible.findIndex((c) => new Date(c.p).getTime() <= lastVisit) : 0;
  const allNew = sinceIdx === -1 && visible.length > 0;
  const sinceCount = allNew ? visible.length : Math.max(sinceIdx, 0);
  const allCaughtUp = sinceCount > 0 && visible.slice(0, sinceCount).every((c) => history[c.s]);
  const H = headingLevel === 2 ? "h2" : "h3";

  const sinceMarker = (
    <div className="flex items-center gap-3 py-3" role="separator" aria-label="마지막 방문 이전 기사">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-ice/50" />
      <span className="kicker text-ice">
        {allCaughtUp ? "✓ 지난 방문 이후 소식을 모두 확인했어요" : `↑ 지난 방문 이후 ${sinceCount}건${allNew ? " 이상" : ""}`}
      </span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-ice/50" />
    </div>
  );

  // j / k / Enter — roving focus over rows (listener lives only while this list is shown).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "j" && e.key !== "k") return;
      e.preventDefault();
      setCursor((c) => {
        const next = e.key === "j" ? Math.min(visible.length - 1, c + 1) : Math.max(0, c - 1);
        const link = listRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-row-link]")[next];
        link?.focus({ preventScroll: false });
        link?.scrollIntoView({ block: "nearest" });
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible.length]);


  return (
    <QueueScope ctx={ctx} label={label} items={queueItems}>
      {filterable && (
        <div className="no-scrollbar -mx-1 mb-4 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="분야 필터">
          {(["all", ...BEAT_ORDER] as const).map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={beat === b}
              onClick={() => setBeat(b)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                beat === b ? "border-ice/50 bg-bg-2 text-fg" : "border-line text-fg-3 hover:border-line-2 hover:text-fg"
              }`}
            >
              {b === "all" ? "전체" : BEATS[b].label}
            </button>
          ))}
        </div>
      )}

      {fresh.length > 0 && (
        <div className="sticky top-[calc(var(--header-h)+var(--ticker-h)+8px)] z-20 mb-3 flex justify-center">
          <button
            type="button"
            onClick={() => {
              router.refresh();
              refreshPulse();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="animate-rise inline-flex items-center gap-2 rounded-full border border-ice/40 bg-bg-1 px-4 py-2 text-[13px] font-semibold text-fg shadow-[var(--shadow-pop)] hover:border-ice"
          >
            <span className="size-1.5 animate-pulse-dot rounded-full bg-live" aria-hidden="true" />새 기사 {fresh.length}건
            <Icon name="arrowRight" size={13} className="-rotate-90" />
          </button>
        </div>
      )}

      <ol ref={listRef} className="relative">
        {visible.map((c, i) => {
          const showDay = dayHeaders && (i === 0 || ymdKST(c.p) !== ymdKST(visible[i - 1].p));
          const read = Boolean(history[c.s]);
          const isNew = sinceCount > 0 && i < sinceCount;
          return (
            <li key={c.s} className="cv-auto" data-read={read ? "true" : undefined}>
              {showDay && i > 0 && (
                <div className="flex items-center gap-3 pb-2 pt-6" role="presentation">
                  <span className="hud text-fg-3">{dateKST(c.p)}</span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              {i === sinceCount && sinceCount > 0 && sinceMarker}
              <article className="group relative grid grid-cols-[52px_1fr] gap-x-3 border-b border-line py-4 sm:grid-cols-[64px_1fr]">
                <div className="read-dim pt-[3px]">
                  <span className="tabular block font-mono text-[12px] text-fg-3">{clockKST(c.p)}</span>
                  {isNew && !read && <span className="hud mt-1 block !text-[9px] text-ice">NEW</span>}
                </div>
                <div className="read-dim min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
                    {showBeat && (
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${beatTextClass(c.b)}`}>
                        <span className={`size-1.5 rounded-full ${beatDotClass(c.b)}`} aria-hidden="true" />
                        {BEATS[c.b].label}
                      </span>
                    )}
                    {c.br && <span className="hud !text-[9.5px] text-live">BREAKING</span>}
                    {c.st && <span className="truncate text-fg-3">스토리 · {c.st}</span>}
                  </div>
                  <H className="text-[17px] font-bold leading-snug tracking-[-0.02em] text-fg sm:text-[18px]">
                    <IntentLink
                      href={`/a/${c.s}`}
                      data-row-link
                      onFocus={() => setCursor(i)}
                      className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline group-hover:text-ice-2"
                      transitionTypes={["open"]}
                    >
                      {c.t}
                    </IntentLink>
                  </H>
                  <p className="mt-1 line-clamp-2 text-[14.5px] leading-relaxed text-fg-3">{c.d}</p>
                  <p className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-4">
                    <span>{readTimeLabel(c.r)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{AI_LABEL[c.ai].short}</span>
                    {read && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-fg-3">읽음</span>
                      </>
                    )}
                  </p>
                </div>
                {cursor === i && <span className="absolute -left-3 top-5 h-5 w-[2px] rounded-full bg-ice" aria-hidden="true" />}
              </article>
            </li>
          );
        })}
      </ol>
      {allNew && sinceMarker}
      {visible.length === 0 && <p className="py-12 text-center text-[14px] text-fg-3">아직 이 분야의 기사가 없습니다.</p>}
    </QueueScope>
  );
}
