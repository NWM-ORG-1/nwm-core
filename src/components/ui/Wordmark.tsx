/**
 * ⌜NWM⌟ — the letters between the corner brackets the site uses for its HUD
 * frames. Solid colours only (letters --fg, brackets --ice), so the light
 * reading theme recolours it without a second asset.
 */

const SIZES = {
  sm: { font: 16, py: 4, px: 5, arm: 7, stroke: 2 },
  md: { font: 21, py: 5, px: 6, arm: 9, stroke: 2 },
  lg: { font: 34, py: 8, px: 10, arm: 14, stroke: 3 },
} as const;

export function Wordmark({ size = "md", className = "" }: { size?: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  const corner = { width: s.arm, height: s.arm } as const;
  return (
    <span className={`relative inline-flex select-none items-center leading-none ${className}`} style={{ padding: `${s.py}px ${s.px}px` }}>
      <span aria-hidden="true" className="absolute left-0 top-0 border-ice" style={{ ...corner, borderLeftWidth: s.stroke, borderTopWidth: s.stroke }} />
      <span className="font-black tracking-[-0.045em] text-fg" style={{ fontSize: s.font }}>
        NWM
      </span>
      <span aria-hidden="true" className="absolute bottom-0 right-0 border-ice" style={{ ...corner, borderRightWidth: s.stroke, borderBottomWidth: s.stroke }} />
    </span>
  );
}
