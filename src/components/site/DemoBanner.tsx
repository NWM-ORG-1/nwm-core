/** Shown while sample content is live (also sets noindex). */
export function DemoBanner() {
  return (
    <div className="relative z-50 flex h-7 items-center justify-center gap-2 border-b border-line bg-bg-1 px-4 text-center text-[11.5px] text-fg-3">
      <span className="hud shrink-0 whitespace-nowrap rounded border border-warn/40 px-1.5 py-[1px] !text-[9.5px] text-warn">DEMO</span>
      <span className="truncate">시범 화면 — 기사·시세·심리 지표는 모두 샘플 데이터이며 실제 사실이 아닙니다.</span>
    </div>
  );
}
