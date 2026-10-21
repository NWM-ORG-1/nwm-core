import { fmtChange } from "@/lib/format";

/** Price change with arrow — Korean colours: 상승 red, 하락 blue. */
export function Change({ pct, digits = 2, className = "" }: { pct: number; digits?: number; className?: string }) {
  const tone = pct > 0 ? "text-up" : pct < 0 ? "text-down" : "text-flat";
  return <span className={`tabular ${tone} ${className}`}>{fmtChange(pct, digits)}</span>;
}

export function Delta({ value, suffix = "", className = "" }: { value: number; suffix?: string; className?: string }) {
  const tone = value > 0 ? "text-up" : value < 0 ? "text-down" : "text-flat";
  const sign = value > 0 ? "▲" : value < 0 ? "▼" : "";
  return (
    <span className={`tabular ${tone} ${className}`}>
      {sign}
      {Math.abs(Math.round(value * 10) / 10)}
      {suffix}
    </span>
  );
}
