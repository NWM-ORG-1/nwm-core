import type { ReactNode } from "react";
import type { AiInvolvement } from "@/db/schema";
import { AI_LABEL, aiLabelLong } from "@/lib/labels";
import { Badge, cx } from "@/components/admin/ui";

/**
 * Presentational pieces for the articles screens. Hook-free, so they render
 * from Server and Client Components alike. Korean labels use `kicker`; the
 * kit's mono `hud` style is kept for Latin codes and numbers only.
 */

/** Panel with a Korean section title, optional count/aside and an anchor id. */
export function Section({
  id,
  title,
  kicker,
  aside,
  lead,
  children,
  className,
  pad = true,
  tone,
}: {
  id?: string;
  title: ReactNode;
  kicker?: string;
  aside?: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
  tone?: "bad";
}) {
  const headingId = id ? `${id}-h` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx("panel scroll-mt-16 overflow-hidden", tone === "bad" && "!border-bad/35", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          {kicker && <p className="hud mb-1 text-fg-4">{kicker}</p>}
          <h2 id={headingId} className="flex flex-wrap items-center gap-2 text-[14px] font-bold tracking-[-0.01em] text-fg">
            {title}
          </h2>
          {lead && <div className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg-3">{lead}</div>}
        </div>
        {aside && <div className="flex shrink-0 flex-wrap items-center gap-2">{aside}</div>}
      </header>
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

/** KPI tile with a Korean label. */
export function Tile({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "good" | "warn" | "bad";
  className?: string;
}) {
  return (
    <div className={cx("panel min-w-0 px-4 py-3.5", className)}>
      <p className="kicker truncate text-fg-3">{label}</p>
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

/** Small metric cell for dense side panels. */
export function MiniStat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-bg-1/60 px-3 py-2.5">
      <p className="kicker truncate !text-[11.5px] text-fg-3">{label}</p>
      <p className="tabular mt-1 text-[18px] font-bold leading-tight tracking-[-0.02em] text-fg">{value}</p>
      {sub && <p className="tabular mt-0.5 truncate text-[11px] text-fg-3">{sub}</p>}
    </div>
  );
}

/** Table header cell for Korean labels. */
export const th = "kicker whitespace-nowrap border-b border-line px-3 py-2.5 text-left font-semibold text-fg-3";

/** 공개 / 비공개 state. */
export function PublishState({ status }: { status: "published" | "unpublished" }) {
  return status === "published" ? (
    <Badge tone="good">
      <span className="size-1.5 rounded-full bg-good" aria-hidden="true" />
      공개
    </Badge>
  ) : (
    <Badge tone="warn">
      <span className="size-1.5 rounded-full border border-warn" aria-hidden="true" />
      비공개
    </Badge>
  );
}

/** Reader-facing AI label, as a non-link pill (the public AiBadge links out to /policy/ai). */
export function AiLabel({ value, editorName, long = false }: { value: AiInvolvement; editorName?: string | null; long?: boolean }) {
  const machine = value !== "human";
  if (!long) {
    // Short labels already say "AI …" / "자동 …" — a dot marks machine involvement.
    return (
      <span title={AI_LABEL[value].explain} className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11.5px] text-fg-3">
        <span className={cx("size-1.5 rounded-[2px]", machine ? "bg-ice/80" : "border border-fg-3")} aria-hidden="true" />
        {AI_LABEL[value].short}
      </span>
    );
  }
  return (
    <span
      title={AI_LABEL[value].explain}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line-2 px-2 py-[2px] text-[11.5px] font-medium text-fg-2"
    >
      <span className={cx("hud !text-[9px] !tracking-[0.12em]", machine ? "text-ice" : "text-fg-3")} aria-hidden="true">
        {machine ? "AI" : "HUMAN"}
      </span>
      {aiLabelLong(value, editorName)}
    </span>
  );
}

export function SampleBadge() {
  return (
    <Badge tone="warn" title="시드 샘플 데이터 — 출시 전 npm run db:purge-samples 로 삭제">
      샘플
    </Badge>
  );
}

export function BreakingBadge() {
  return (
    <span className="hud inline-flex items-center gap-1 rounded-md border border-live/40 px-1.5 py-[2px] !text-[9.5px] text-live">
      <span className="size-1 rounded-full bg-live" aria-hidden="true" />
      BREAKING
    </span>
  );
}
