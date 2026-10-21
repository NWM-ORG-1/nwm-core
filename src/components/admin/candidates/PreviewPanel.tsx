"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { ArticlePreview, type PreviewArticle } from "./ArticlePreview";

type Device = "mobile" | "desktop";

const FRAME: Record<Device, number> = { mobile: 390 + 16, desktop: 760 };

/** Scale factor that fits a fixed-width frame into its container (never enlarges). */
function useFit(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      setScale(w > 0 ? Math.min(1, w / width) : 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return [ref, scale] as const;
}

function DeviceToggle({ device, onChange }: { device: Device; onChange: (d: Device) => void }) {
  return (
    <div role="radiogroup" aria-label="미리보기 화면" className="inline-flex rounded-lg border border-line-2 p-0.5">
      {(["mobile", "desktop"] as const).map((d) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={device === d}
          onClick={() => onChange(d)}
          className={cx("h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors", device === d ? "bg-bg-3 text-fg" : "text-fg-3 hover:text-fg")}
        >
          {d === "mobile" ? "모바일 390" : "데스크톱"}
        </button>
      ))}
    </div>
  );
}

/** Phone or browser chrome around the article, at true CSS size. */
function Frame({ device, article, tall = false }: { device: Device; article: PreviewArticle; tall?: boolean }) {
  if (device === "mobile") {
    return (
      <div className="w-[406px] rounded-[42px] border-[8px] border-bg-3 bg-bg shadow-[var(--shadow-pop)]">
        <div className="flex h-8 items-center justify-between px-6 pt-1 font-mono text-[11px] font-semibold text-fg-2" aria-hidden="true">
          <span>9:41</span>
          <span className="h-[18px] w-[86px] rounded-full bg-bg-3" />
          <span className="tracking-[0.1em]">5G ▮</span>
        </div>
        <div className={cx("overflow-y-auto overscroll-contain rounded-b-[34px] px-4 pb-12 pt-6", tall ? "h-[min(780px,calc(100dvh-140px))]" : "h-[720px]")}>
          <ArticlePreview a={article} device="mobile" />
        </div>
      </div>
    );
  }
  return (
    <div className="w-[760px] overflow-hidden rounded-xl border border-line-2 bg-bg shadow-[var(--shadow-pop)]">
      <div className="flex h-8 items-center gap-1.5 border-b border-line bg-bg-1 px-3" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-bg-3" />
        <span className="size-2.5 rounded-full bg-bg-3" />
        <span className="size-2.5 rounded-full bg-bg-3" />
        <span className="mx-auto rounded-md bg-bg-2 px-8 py-0.5 font-mono text-[10.5px] text-fg-3">newweb.media/a/…</span>
      </div>
      <div className={cx("overflow-y-auto px-[60px] pb-14 pt-10", tall ? "h-[min(860px,calc(100dvh-140px))]" : "h-[760px]")}>
        <ArticlePreview a={article} device="desktop" />
      </div>
    </div>
  );
}

export function PreviewPanel({
  article,
  previewHref,
  dirty,
  beforeOpen,
}: {
  article: PreviewArticle;
  previewHref: string;
  /** unsaved edits: the full-page preview reads the saved copy, so save before opening it */
  dirty: boolean;
  beforeOpen: () => Promise<boolean>;
}) {
  const [device, setDevice] = useState<Device>("mobile");
  const [big, setBig] = useState(false);
  const [wrap, scale] = useFit(FRAME[device]);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (big && !d.open) d.showModal();
    else if (!big && d.open) d.close();
  }, [big]);
  useLayoutEffect(() => {
    const d = dialog.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DeviceToggle device={device} onChange={setDevice} />
        <button type="button" onClick={() => setBig(true)} className={cx(btn.base, btn.quiet, "h-7 px-2 text-[12px]")}>
          <Icon name="arrowUpRight" size={12} /> 크게 보기
        </button>
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => {
            if (!dirty || e.metaKey || e.ctrlKey || e.shiftKey) return;
            // open the tab within the click (popup blockers), navigate once the save landed
            e.preventDefault();
            const w = window.open("about:blank", "_blank");
            if (w) w.opener = null;
            void beforeOpen().finally(() => {
              if (w) w.location.replace(previewHref);
              else window.location.assign(previewHref);
            });
          }}
          className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-ice hover:underline"
          title="저장된 초안 기준 전체 화면 미리보기 — 변경이 있으면 먼저 저장합니다"
        >
          새 탭 <Icon name="external" size={12} />
        </a>
      </div>
      <p className="text-[11.5px] leading-relaxed text-fg-4">
        공개 기사와 같은 컴포넌트로 그립니다. {device === "mobile" ? "390px 폰 화면" : "데스크톱 본문 폭(640px)"}
        {scale < 1 ? ` · ${Math.round(scale * 100)}% 축소` : ""} · 입력 즉시 반영
      </p>
      <div ref={wrap} className="w-full">
        <div className="mx-auto" style={{ width: FRAME[device], zoom: scale }}>
          <Frame device={device} article={article} />
        </div>
      </div>

      <dialog
        ref={dialog}
        onClose={() => setBig(false)}
        aria-label="기사 미리보기 크게 보기"
        className="m-auto max-h-[calc(100dvh-24px)] max-w-[calc(100vw-24px)] overflow-auto rounded-[var(--radius)] border border-line-2 bg-bg-1 p-4 text-fg shadow-[var(--shadow-pop)] backdrop:bg-black/70 backdrop:backdrop-blur-[2px]"
      >
        <div className="mb-3 flex items-center gap-3">
          <DeviceToggle device={device} onChange={setDevice} />
          <span className="hidden text-[12px] text-fg-3 sm:inline">실제 크기 · 입력 중인 초안</span>
          <button type="button" onClick={() => dialog.current?.close()} className={cx(btn.base, btn.ghost, "ml-auto h-7 px-2.5 text-[12px]")}>
            <Icon name="close" size={12} /> 닫기
          </button>
        </div>
        {big && (
          <div className="flex justify-center">
            <Frame device={device} article={article} tall />
          </div>
        )}
      </dialog>
    </div>
  );
}
