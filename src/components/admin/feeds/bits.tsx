import type { ReactNode } from "react";
import { cx } from "@/components/admin/ui";

/**
 * Small presentational pieces shared by the feeds / sources / experiments
 * screens. No hooks — usable from Server and Client Components.
 */

/** Experiment identity chip: validated chart slot colour + code text (colour is never the only cue). */
export function ExperimentChip({ code, colorSlot, size = "sm" }: { code: string; colorSlot: number; size?: "sm" | "md" }) {
  const c = `var(--c-${colorSlot})`;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border font-mono font-bold tracking-[0.02em] text-fg",
        size === "md" ? "h-7 px-2 text-[13px]" : "h-[22px] px-1.5 text-[11.5px]",
      )}
      style={{ borderColor: `color-mix(in srgb, ${c} 60%, transparent)`, background: `color-mix(in srgb, ${c} 16%, transparent)` }}
    >
      <span className={cx("rounded-[3px]", size === "md" ? "size-2.5" : "size-2")} style={{ background: c }} aria-hidden="true" />
      {code}
    </span>
  );
}

/** Korean section label (kicker) with an optional trailing element. */
export function SectionLabel({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center justify-between gap-3", className)}>
      <h2 className="kicker text-fg-3">{children}</h2>
      {aside}
    </div>
  );
}

/** Thin labelled horizontal meter (0–1). */
export function Meter({ value, color = "var(--ice)", label }: { value: number | null; color?: string; label: string }) {
  const w = value == null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className="relative block h-1 w-full overflow-hidden rounded-full bg-bg-3" role="img" aria-label={label}>
      {w > 0 && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, w * 100)}%`, background: color }} />}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line-2 bg-bg-2 px-1 font-mono text-[10.5px] font-semibold text-fg-2">
      {children}
    </kbd>
  );
}

export const field = {
  label: "kicker text-fg-2",
  help: "mt-1 text-[12px] leading-relaxed text-fg-3",
  input:
    "h-9 w-full rounded-lg border border-line-2 bg-bg-1 px-3 text-[13.5px] text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-bad",
  select:
    "h-9 w-full rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[13.5px] text-fg transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none",
  textarea:
    "w-full rounded-lg border border-line-2 bg-bg-1 px-3 py-2 text-[13.5px] leading-relaxed text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-bad",
  check: "size-4 shrink-0 rounded border-line-3 accent-[var(--ice)]",
};

/** Table header cell for Korean labels (the kit's `hud` header is for Latin only). */
export const th = "kicker whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-semibold text-fg-3";

/** KPI tile with a Korean label (the kit's Stat uses the Latin-only HUD label). */
export function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  return (
    <div className="panel px-4 py-3.5">
      <p className="kicker text-fg-3">{label}</p>
      <p
        className={cx(
          "tabular mt-2 text-[24px] font-bold leading-none tracking-[-0.02em]",
          tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : tone === "good" ? "text-good" : "text-fg",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[12px] leading-snug text-fg-3">{sub}</p>}
    </div>
  );
}

export function FormSkeleton({ aside = true }: { aside?: boolean }) {
  return (
    <div className={cx("grid gap-5 px-4 py-5 sm:px-6", aside && "xl:grid-cols-[minmax(0,1fr)_300px]")} aria-busy="true" aria-label="불러오는 중">
      <div className="max-w-4xl space-y-5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="skeleton h-64" />
        ))}
      </div>
      {aside && <div className="skeleton hidden h-80 xl:block" />}
    </div>
  );
}
