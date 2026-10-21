import { sentimentLabel } from "@/lib/labels";

/**
 * Diverging sentiment gauge, −100 (fear, blue) … 0 (neutral) … +100 (greed, red).
 * The numeric score and zone label are always printed; colour only reinforces.
 */
export function Gauge({ score, size = 168, label = true }: { score: number; size?: number; label?: boolean }) {
  const clamped = Math.max(-100, Math.min(100, score));
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const angle = Math.PI * (1 - (clamped + 100) / 200); // π (left, −100) → 0 (right, +100)
  const nx = cx + Math.cos(angle) * (r - 6);
  const ny = cy - Math.sin(angle) * (r - 6);
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - (from + 100) / 200);
    const a1 = Math.PI * (1 - (to + 100) / 200);
    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy - Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy - Math.sin(a1) * r;
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  const segments: Array<[number, number, string, number]> = [
    [-100, -60, "var(--down)", 0.9],
    [-58, -20, "var(--down)", 0.5],
    [-18, 18, "var(--flat)", 0.45],
    [20, 58, "var(--up)", 0.5],
    [60, 100, "var(--up)", 0.9],
  ];
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`} role="img" aria-label={`심리 점수 ${Math.round(clamped)}, ${sentimentLabel(clamped)}`}>
        {segments.map(([a, b, c, o]) => (
          <path key={a} d={arc(a, b)} stroke={c} strokeOpacity={o} strokeWidth={8} fill="none" strokeLinecap="round" />
        ))}
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--fg)" strokeWidth={2} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="var(--fg)" />
        <circle cx={cx} cy={cy} r={8} fill="none" stroke="var(--line-3)" />
      </svg>
      {label && (
        <div className="-mt-1 flex flex-col items-center">
          <span className="tabular text-[34px] font-bold leading-none tracking-[-0.03em] text-fg">{Math.round(clamped)}</span>
          <span className="mt-1 text-[12px] font-semibold text-fg-3">{sentimentLabel(clamped)}</span>
        </div>
      )}
    </div>
  );
}

/** Horizontal diverging bar for one score. */
export function DivergingBar({ score, className = "" }: { score: number; className?: string }) {
  const v = Math.max(-100, Math.min(100, score));
  const w = Math.abs(v) / 2; // % of full width
  return (
    <div className={`relative h-1.5 w-full rounded-full bg-bg-3 ${className}`} aria-hidden="true">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line-3" />
      <div
        className="absolute inset-y-0 rounded-full"
        style={{
          left: v >= 0 ? "50%" : `${50 - w}%`,
          width: `${w}%`,
          background: v >= 0 ? "var(--up)" : "var(--down)",
          opacity: 0.85,
        }}
      />
    </div>
  );
}
