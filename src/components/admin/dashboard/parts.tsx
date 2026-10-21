import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "../ui";

/**
 * Card heading for Korean titles. `Card` renders its title inside a mono HUD
 * heading; this resets the face to the Korean `kicker` style and keeps the
 * Latin window code (7D, 48H) in HUD mono beside it.
 */
export function CardTitle({ children, code }: { children: ReactNode; code?: string }) {
  return (
    <span className="inline-flex items-baseline gap-2 font-sans normal-case tracking-normal">
      <span className="kicker text-fg-2">{children}</span>
      {code && <span className="hud text-fg-3">{code}</span>}
    </span>
  );
}

/** KPI tile — the Stat tile layout with a Korean label and a state line that never relies on colour alone. */
export function Kpi({
  label,
  code,
  value,
  unit,
  sub,
  tone,
  title,
}: {
  label: string;
  code?: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
  tone?: "good" | "warn" | "bad";
  title?: string;
}) {
  return (
    <div className="panel flex min-w-0 flex-col px-4 py-3.5" title={title}>
      <p className="flex items-baseline justify-between gap-2">
        <span className="kicker truncate text-fg-3">{label}</span>
        {code && <span className="hud shrink-0 text-fg-4">{code}</span>}
      </p>
      <p
        className={cx(
          "tabular mt-2.5 text-[26px] font-bold leading-none tracking-[-0.02em]",
          tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg",
        )}
      >
        {value}
        {unit && <span className="ml-0.5 text-[14px] font-semibold tracking-normal text-fg-3">{unit}</span>}
      </p>
      {sub && (
        <p
          className={cx(
            "mt-2 flex items-center gap-1 text-[12px] leading-snug",
            tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg-3",
          )}
        >
          {tone && tone !== "good" && <Icon name="alert" size={12} className="shrink-0" />}
          <span className="min-w-0">{sub}</span>
        </p>
      )}
    </div>
  );
}

/** Section heading inside a card (Korean label + count). */
export function SubHead({ children, count, tone }: { children: ReactNode; count?: number; tone?: "bad" | "warn" }) {
  return (
    <h3 className="mb-1.5 flex items-center gap-2 text-[11.5px] font-semibold text-fg-3">
      {tone && <span className={cx("size-1.5 rounded-full", tone === "bad" ? "bg-bad" : "bg-warn")} aria-hidden="true" />}
      {children}
      {count != null && <span className="tabular font-mono text-[11px] text-fg-4">{count}</span>}
    </h3>
  );
}

/** Compact text / icon buttons (not merged with `btn.base`, whose height and padding would win). */
export const small = {
  text: "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40",
  icon: "inline-grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg",
};

export const field = {
  label: "kicker mb-1.5 block text-fg-2",
  input:
    "h-9 w-full rounded-lg border border-line-2 bg-bg-1 px-3 text-[13.5px] text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice/60 disabled:cursor-not-allowed disabled:opacity-60",
  textarea:
    "w-full resize-y rounded-lg border border-line-2 bg-bg-1 px-3 py-2 text-[13.5px] leading-relaxed text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice/60",
  hint: "mt-1 text-[11.5px] leading-snug text-fg-3",
  search:
    "h-8 w-full rounded-lg border border-line-2 bg-bg-1 pl-8 pr-3 text-[13px] text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice/60",
};
