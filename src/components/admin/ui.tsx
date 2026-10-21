import Link from "next/link";
import type { ReactNode } from "react";
import type { CandidateMode, CandidateStatus } from "@/db/schema";
import { CANDIDATE_MODE_LABEL, CANDIDATE_STATUS_LABEL, TRUST_TIER_LABEL } from "@/lib/labels";

/**
 * Newsroom UI kit — dense, terminal-toned, same tokens as the public site.
 * Server components only (no client JS); interactive pieces live in ./client.
 */

export const btn = {
  base: "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-8 text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none",
  primary: "bg-ice text-bg hover:bg-ice-2",
  ghost: "border border-line-2 text-fg-2 hover:border-line-3 hover:text-fg",
  quiet: "text-fg-3 hover:text-fg hover:bg-bg-2",
  danger: "border border-bad/40 text-bad hover:bg-bad/10",
};

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  kicker,
  description,
  actions,
}: {
  title: string;
  kicker?: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-6 pb-5 pt-6">
      <div className="min-w-0">
        {kicker && <p className="hud mb-2 text-ice">{kicker}</p>}
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-fg">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-fg-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, actions, children, className = "", pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("panel overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {title && <h2 className="hud text-fg-3">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="panel px-4 py-3.5">
      <p className="hud text-fg-3">{label}</p>
      <p className={cx("tabular mt-2 text-[26px] font-bold leading-none tracking-[-0.02em]", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg")}>{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-fg-3">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "ice" | "good" | "warn" | "bad" | "live"; title?: string }) {
  const tones = {
    neutral: "border-line-2 text-fg-3",
    ice: "border-ice/40 text-ice",
    good: "border-good/40 text-good",
    warn: "border-warn/40 text-warn",
    bad: "border-bad/40 text-bad",
    live: "border-live/40 text-live",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-[1px] text-[11px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<CandidateStatus, "neutral" | "ice" | "good" | "warn" | "bad"> = {
  new: "neutral",
  drafting: "ice",
  review: "warn",
  scheduled: "ice",
  published: "good",
  rejected: "bad",
};

export function StatusBadge({ status }: { status: CandidateStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{CANDIDATE_STATUS_LABEL[status]}</Badge>;
}

export function ModeBadge({ mode }: { mode: CandidateMode }) {
  const m = CANDIDATE_MODE_LABEL[mode];
  return (
    <Badge tone={mode === "data_auto" ? "good" : mode === "editor_idea" ? "warn" : "ice"} title={m.label}>
      {mode === "feed_draft" ? "A" : mode === "data_auto" ? "B" : "C"} · {m.short}
    </Badge>
  );
}

/** Experiment (hypothesis) chip in its validated chart colour. Colour + code text. */
export function ExperimentDot({ code, colorSlot }: { code: string; colorSlot: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-fg-2">
      <span className="size-2 rounded-[3px]" style={{ background: `var(--c-${colorSlot})` }} aria-hidden="true" />
      {code}
    </span>
  );
}

export function TrustBadge({ tier }: { tier: number }) {
  return (
    <Badge tone={tier <= 1 ? "good" : tier === 2 ? "ice" : tier === 3 ? "warn" : "bad"} title="신뢰 등급">
      T{tier} {TRUST_TIER_LABEL[tier]}
    </Badge>
  );
}

/** Licence summary: 상업 / 재배포 / 원문 — ✓ ✕ ? */
export function LicenseIcons({
  commercialOk,
  redistributionOk,
  verbatimOk,
  reviewed,
  signalOnly,
}: {
  commercialOk: boolean | null;
  redistributionOk: boolean | null;
  verbatimOk: boolean | null;
  reviewed: boolean;
  signalOnly?: boolean;
}) {
  if (signalOnly) return <Badge tone="warn" title="재작성·인용 금지, 신호 용도로만 사용">신호 전용</Badge>;
  if (!reviewed) return <Badge tone="bad" title="라이선스 검토 전에는 발행에 사용할 수 없습니다">라이선스 미검토</Badge>;
  const mark = (v: boolean | null) => (v === true ? "✓" : v === false ? "✕" : "?");
  const tone = (v: boolean | null) => (v === true ? "text-good" : v === false ? "text-bad" : "text-warn");
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px]" title="상업 이용 · 재배포 · 원문 인용">
      <span className={tone(commercialOk)}>상업{mark(commercialOk)}</span>
      <span className={tone(redistributionOk)}>재배포{mark(redistributionOk)}</span>
      <span className={tone(verbatimOk)}>원문{mark(verbatimOk)}</span>
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`뉴스 가치 점수 ${score}`}>
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-bg-3">
        <span className="absolute inset-y-0 left-0 rounded-full bg-ice" style={{ width: `${Math.max(4, Math.min(100, score))}%`, opacity: 0.4 + score / 170 }} />
      </span>
      <span className="tabular font-mono text-[11px] text-fg-3">{score}</span>
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="text-[15px] font-semibold text-fg-2">{title}</p>
      {children && <div className="max-w-md text-[13px] leading-relaxed text-fg-3">{children}</div>}
    </div>
  );
}

export function TabLinks({ tabs, active }: { tabs: Array<{ href: string; label: string; count?: number; key: string }>; active: string }) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="필터">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
            t.key === active ? "bg-bg-3 text-fg" : "text-fg-3 hover:bg-bg-2 hover:text-fg",
          )}
        >
          {t.label}
          {t.count != null && <span className="tabular font-mono text-[11px] text-fg-3">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export const table = {
  wrap: "overflow-x-auto",
  table: "w-full border-collapse text-left text-[13px]",
  th: "hud whitespace-nowrap border-b border-line px-3 py-2.5 font-normal text-fg-3",
  td: "border-b border-line px-3 py-2.5 align-top text-fg-2",
  row: "hover:bg-bg-2/60 transition-colors",
};

/** Minimal bar chart (single series), with an accessible summary. */
export function Bars({ values, height = 56, label }: { values: number[]; height?: number; label: string }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <figure>
      <div className="flex items-end gap-[2px]" style={{ height }} role="img" aria-label={`${label}: 합계 ${total}, 최대 ${max}`}>
        {values.map((v, i) => (
          <div
            key={i}
            title={`${v}`}
            className="flex-1 rounded-t-[3px] bg-ice/70 hover:bg-ice"
            style={{ height: `${Math.max(v ? 6 : 2, (v / max) * 100)}%`, opacity: v ? 1 : 0.25 }}
          />
        ))}
      </div>
    </figure>
  );
}
