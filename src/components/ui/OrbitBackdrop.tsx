/** Thin luminous orbital ellipses (Warpgate family motif). Decorative, hero only. */
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
      <rect width="1200" height="600" fill="url(#orbit-core)" />
      <g className="orbit-drift">
        <ellipse cx="860" cy="250" rx="520" ry="150" fill="none" stroke="url(#orbit-a)" strokeWidth="1.2" transform="rotate(-24 860 250)" />
        <ellipse cx="860" cy="250" rx="380" ry="105" fill="none" stroke="url(#orbit-a)" strokeWidth="1" transform="rotate(-18 860 250)" />
        <ellipse cx="860" cy="250" rx="640" ry="230" fill="none" stroke="url(#orbit-a)" strokeWidth="0.8" opacity="0.6" transform="rotate(-31 860 250)" />
      </g>
    </svg>
  );
}
