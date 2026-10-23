/**
 * Thin orbital ellipses (Warpgate family motif) behind banners. A short light
 * travels each orbit at its own pace, the set drifts and the glow breathes —
 * slow enough to read as ambience. Decorative; hidden from assistive tech and
 * stilled under prefers-reduced-motion (globals.css).
 */

const ORBITS = [
  { rx: 520, ry: 150, rot: -24, width: 1.2, opacity: 1, period: 38, delay: -6 },
  { rx: 380, ry: 105, rot: -18, width: 1, opacity: 1, period: 27, delay: -17 },
  { rx: 640, ry: 230, rot: -31, width: 0.8, opacity: 0.6, period: 56, delay: -31 },
] as const;

const CX = 860;
const CY = 250;

export function OrbitBackdrop({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" className={`pointer-events-none ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="orbit-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--ice)" stopOpacity="0" />
          <stop offset="0.45" stopColor="var(--ice)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--ice-2)" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id="orbit-core" cx="0.72" cy="0.42" r="0.5">
          <stop offset="0" stopColor="var(--ice-3)" stopOpacity="0.18" />
          <stop offset="1" stopColor="var(--ice-3)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="600" fill="url(#orbit-core)" className="orbit-breathe" />
      <g className="orbit-drift">
        {ORBITS.map((o) => {
          const shape = { cx: CX, cy: CY, rx: o.rx, ry: o.ry, fill: "none", transform: `rotate(${o.rot} ${CX} ${CY})` };
          const timing = { animationDuration: `${o.period}s`, animationDelay: `${o.delay}s` };
          return (
            <g key={o.rx} opacity={o.opacity}>
              <ellipse {...shape} stroke="url(#orbit-a)" strokeWidth={o.width} />
              {/* the travelling light: a soft halo and a bright core, each one dash long */}
              <ellipse {...shape} pathLength={100} strokeDasharray="7 93" stroke="var(--ice)" strokeOpacity={0.16} strokeWidth={o.width * 7} strokeLinecap="round" className="orbit-comet" style={timing} />
              <ellipse {...shape} pathLength={100} strokeDasharray="3.5 96.5" stroke="var(--ice-2)" strokeOpacity={0.9} strokeWidth={o.width * 1.8} strokeLinecap="round" className="orbit-comet" style={timing} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
