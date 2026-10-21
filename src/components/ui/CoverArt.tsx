import type { Beat } from "@/db/schema";
import { BEATS } from "@/lib/beats";
import { hashString } from "@/lib/format";

/**
 * Procedural cover art (zero image bytes). Deterministic per slug: thin orbital
 * ellipses over a blueprint grid, the beat code in the corner and an optional
 * signal line. Inherits the family look — ice gradients, luminous hairlines.
 */
export function CoverArt({
  seed,
  beat,
  points,
  className = "",
  variant = "wide",
}: {
  seed: string;
  beat: Beat;
  points?: number[];
  className?: string;
  variant?: "wide" | "square";
}) {
  const h = hashString(seed);
  const W = variant === "wide" ? 640 : 320;
  const H = variant === "wide" ? 280 : 320;
  const rnd = (i: number) => Math.abs(((h >>> (i % 24)) ^ Math.imul(h, i + 7)) % 1000) / 1000;
  const id = `c${h.toString(36)}`;
  const accent = `var(--beat-${beat})`;
  const rings = 3 + (h % 3);
  const cx = W * (0.55 + rnd(1) * 0.3);
  const cy = H * (0.45 + rnd(2) * 0.3);

  let line = "";
  if (points && points.length > 1) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    line = points
      .map((v, i) => `${i ? "L" : "M"}${(24 + (i / (points.length - 1)) * (W - 48)).toFixed(1)},${(H * 0.78 - ((v - min) / span) * H * 0.38).toFixed(1)}`)
      .join("");
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}g`} cx={cx / W} cy={cy / H} r="0.7">
          <stop offset="0" stopColor={accent} stopOpacity="0.28" />
          <stop offset="0.55" stopColor="var(--ice-3)" stopOpacity="0.08" />
          <stop offset="1" stopColor="var(--bg-1)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}s`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--ice-3)" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="var(--ice)" stopOpacity="0.7" />
          <stop offset="1" stopColor="var(--ice-2)" stopOpacity="0.15" />
        </linearGradient>
        <pattern id={`${id}p`} width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="var(--line)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="var(--bg-1)" />
      <rect width={W} height={H} fill={`url(#${id}p)`} />
      <rect width={W} height={H} fill={`url(#${id}g)`} />
      {Array.from({ length: rings }, (_, i) => {
        const rx = W * (0.22 + i * 0.13 + rnd(i + 3) * 0.05);
        const ry = rx * (0.28 + rnd(i + 9) * 0.18);
        const rot = -28 + rnd(i + 5) * 36;
        return (
          <ellipse
            key={i}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke={`url(#${id}s)`}
            strokeWidth={i === 0 ? 1.4 : 1}
            transform={`rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}
          />
        );
      })}
      <circle cx={cx} cy={cy} r="3" fill={accent} />
      <circle cx={cx} cy={cy} r="9" fill="none" stroke={accent} strokeOpacity="0.4" />
      {line && <path d={line} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />}
      <text x="22" y="34" fill="var(--fg-3)" fontFamily="var(--font-pixel)" fontSize="15" letterSpacing="2">
        {BEATS[beat].code}
      </text>
      <text x={W - 22} y={H - 20} textAnchor="end" fill="var(--fg-4)" fontFamily="var(--font-mono)" fontSize="11" letterSpacing="2">
        {`#${(h % 100000).toString().padStart(5, "0")}`}
      </text>
    </svg>
  );
}
