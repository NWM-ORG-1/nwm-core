/**
 * Single-series sparkline (server SVG). Direction is carried by the end marker
 * and the caller's ▲▼ text, not colour alone.
 */
export function Sparkline({
  points,
  width = 96,
  height = 28,
  tone = "auto",
  strokeWidth = 1.5,
  area = true,
  className = "",
  label,
}: {
  points: number[];
  width?: number;
  height?: number;
  tone?: "auto" | "ice" | "up" | "down" | "muted";
  strokeWidth?: number;
  area?: boolean;
  className?: string;
  label?: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 2;
  const xs = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const ys = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const d = points.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join("");
  const dir = points[points.length - 1] - points[0];
  const resolved = tone === "auto" ? (dir > 0 ? "up" : dir < 0 ? "down" : "muted") : tone;
  const color =
    resolved === "up" ? "var(--up)" : resolved === "down" ? "var(--down)" : resolved === "ice" ? "var(--ice)" : "var(--fg-3)";
  const lastX = xs(points.length - 1);
  const lastY = ys(points[points.length - 1]);
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {area && (
        <path
          d={`${d}L${lastX.toFixed(1)},${height}L${pad},${height}Z`}
          fill={color}
          opacity="0.08"
        />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2.25} fill={color} />
    </svg>
  );
}
