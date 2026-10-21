import type { Beat } from "@/db/schema";
import { BEATS } from "@/lib/beats";
import { beatDotClass } from "@/components/ui/BeatChip";
import { OrbitBackdrop } from "@/components/ui/OrbitBackdrop";

export function BeatHeader({ beat, count24h, extra }: { beat: Beat; count24h: number; extra?: React.ReactNode }) {
  const meta = BEATS[beat];
  return (
    <header className="relative overflow-hidden border-b border-line">
      <OrbitBackdrop className="absolute inset-0 h-full w-full opacity-70" />
      <div className="bg-grid absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="relative mx-auto max-w-[1320px] px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
        <p className="hud flex items-center gap-2 text-fg-3">
          <span className={`size-2 rounded-full ${beatDotClass(beat)}`} aria-hidden="true" />
          SECTION / {meta.code}
        </p>
        <h1 className="text-ice mt-4 text-[44px] font-extrabold leading-none tracking-[-0.04em] sm:text-[64px]">{meta.label}</h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">{meta.blurb}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-[13px] text-fg-3">
          <span>
            최근 24시간 <strong className="tabular text-fg">{count24h}</strong>건
          </span>
          {extra}
        </div>
      </div>
    </header>
  );
}
