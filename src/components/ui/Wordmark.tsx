/** ↗ NWM — the family arrow mark (New Web Solutions) + monogram. */
export function ArrowMark({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="nwm-arrow" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--ice-3)" />
          <stop offset="0.6" stopColor="var(--ice)" />
          <stop offset="1" stopColor="var(--ice-2)" />
        </linearGradient>
      </defs>
      <path
        d="M5 19 18.5 5.5M8.5 5.5h10v10"
        fill="none"
        stroke="url(#nwm-arrow)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark({ withName = false, size = "md" }: { withName?: boolean; size?: "sm" | "md" | "lg" }) {
  const text = size === "lg" ? "text-[30px]" : size === "sm" ? "text-[17px]" : "text-[21px]";
  const icon = size === "lg" ? 28 : size === "sm" ? 15 : 19;
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <ArrowMark size={icon} />
      <span className={`${text} font-extrabold leading-none tracking-[-0.03em] text-ice`}>NWM</span>
      {withName && <span className="hidden sm:inline text-[12.5px] font-medium tracking-[-0.01em] text-fg-3">뉴웹미디어</span>}
    </span>
  );
}
