import Link from "next/link";
import type { ReactNode } from "react";
import type { DeskAdmin, DeskDecisionRow } from "@/data/admin-desk";
import { Ago } from "@/components/admin/feeds/time";
import { Badge, StatusBadge, cx, table } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";
import type { DeskModel, Effect, TrafficSource } from "@/server/desk/types";

/** Server-rendered pieces of 뉴스룸 → AI 데스크. */

export function decisionLabel(d: Pick<DeskDecisionRow, "decision" | "waiting" | "candidate">): { text: string; tone: "good" | "ice" | "warn" | "neutral" } {
  if (d.candidate) return { text: "초안", tone: "good" };
  if (d.waiting) return { text: "대기", tone: "ice" };
  if (d.decision === "hold") return { text: "보류", tone: "warn" };
  if (d.decision === "draft") return { text: "초안", tone: "good" };
  return { text: "제외", tone: "neutral" };
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function scoreTitle(s: DeskDecisionRow["scores"]) {
  return `뉴스 ${s.news} · 관심 ${s.interest} · 근거 ${s.evidence} · 위험 ${s.risk} → 기본 ${s.base} · 학습 ${signed(s.prior)} · 탐색 +${s.explore}`;
}

export function DecisionItem({ d }: { d: DeskDecisionRow }) {
  const l = decisionLabel(d);
  const scored = d.scores.base > 0;
  return (
    <li className="space-y-1 border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
        <Badge tone={l.tone}>{l.text}</Badge>
        {scored && (
          <span className="tabular font-mono text-[12px] font-semibold text-fg-2" title={scoreTitle(d.scores)}>
            {d.scores.final}점
          </span>
        )}
        {d.beat && <BeatChip beat={d.beat} />}
        {d.topic && <span className="text-fg-3">{d.topic}</span>}
        {d.lowRisk && (
          <Badge tone="good" title="위험·근거·출처·체크 기준을 모두 통과했습니다. 자동 발행은 꺼져 있습니다.">
            저위험
          </Badge>
        )}
        <span className="ml-auto text-fg-4">
          <Ago iso={d.at} />
        </span>
      </div>
      <p className="text-[13.5px] leading-snug text-fg">{d.angle || d.lead?.title || "—"}</p>
      <p className="text-[12px] leading-snug text-fg-3">
        {d.reason}
        <span className="text-fg-4">
          {" "}
          · 자료 {d.items}건{d.lead?.source ? ` · ${d.lead.source}` : ""}
        </span>
      </p>
      {d.candidate && (
        <p className="flex flex-wrap items-center gap-2 pt-0.5 text-[12.5px]">
          <StatusBadge status={d.candidate.status} />
          <Link href={`/admin/candidates/${d.candidate.id}`} className="min-w-0 flex-1 truncate text-ice hover:underline">
            {d.candidate.title}
          </Link>
          {d.candidate.articleSlug && (
            <Link href={`/a/${d.candidate.articleSlug}`} className="text-fg-3 hover:text-ice">
              기사 보기 ↗
            </Link>
          )}
        </p>
      )}
    </li>
  );
}

export function DecisionList({ rows, empty }: { rows: DeskDecisionRow[]; empty: string }) {
  if (!rows.length) return <p className="px-4 py-6 text-[12.5px] text-fg-4">{empty}</p>;
  return (
    <ul>
      {rows.map((d) => (
        <DecisionItem key={d.id} d={d} />
      ))}
    </ul>
  );
}

/* ───────────────────────── learning ───────────────────────── */

export const PHASE: Record<DeskModel["phase"], { label: string; text: string }> = {
  cold: {
    label: "수집 중",
    text: "독자 반응이 아직 적어 점수에 넣지 않습니다. 발행 후 하루가 지난 기사가 20건 이상, 기사당 조회 중앙값이 5회 이상이 되면 반영을 시작합니다. 그전에는 뉴스 가치·근거와 편집자의 발행·반려만 반영합니다.",
  },
  warming: { label: "학습 초기", text: "독자 반응을 절반 무게로 반영합니다. 검색 유입이 거의 없는 시기라 조회수보다 완독률·체류 시간을 더 봅니다." },
  learning: { label: "학습 중", text: "독자 반응을 온전히 반영합니다. 표본이 적은 주제는 평균 쪽으로 당겨서 봅니다." },
};

const TRAFFIC: Array<{ key: TrafficSource; label: string; color: string }> = [
  { key: "search", label: "검색", color: "var(--c-1)" },
  { key: "social", label: "SNS·커뮤니티", color: "var(--c-2)" },
  { key: "direct", label: "직접", color: "var(--c-3)" },
  { key: "internal", label: "사이트 안", color: "var(--c-4)" },
  { key: "other", label: "기타", color: "var(--fg-4)" },
];

export function TrafficBar({ traffic }: { traffic: Record<TrafficSource, number> }) {
  const total = TRAFFIC.reduce((s, t) => s + traffic[t.key], 0);
  if (!total) return <p className="text-[12.5px] text-fg-4">아직 유입 기록이 없습니다. 기사가 발행되고 읽히면 쌓입니다.</p>;
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <figure className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-bg-3" role="img" aria-label={TRAFFIC.map((t) => `${t.label} ${pct(traffic[t.key])}%`).join(", ")}>
        {TRAFFIC.map((t) => (traffic[t.key] ? <span key={t.key} style={{ width: `${(traffic[t.key] / total) * 100}%`, background: t.color }} /> : null))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-3">
        {TRAFFIC.map((t) => (
          <span key={t.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[3px]" style={{ background: t.color }} aria-hidden="true" />
            {t.label} <span className="tabular font-mono text-fg-2">{traffic[t.key].toLocaleString("ko-KR")}</span>
            <span className="text-fg-4">({pct(traffic[t.key])}%)</span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

/** Group effects, strongest first; reader effects are in z units, editor effects in acceptance-rate points. */
export function Effects({ title, rec, unit, minN = 2 }: { title: string; rec: Record<string, Effect>; unit: "z" | "rate"; minN?: number }) {
  const rows = Object.entries(rec)
    .filter(([k, e]) => k && e.n >= minN)
    .sort((a, b) => Math.abs(b[1].mean) - Math.abs(a[1].mean))
    .slice(0, 8);
  const fmt = (m: number) => (unit === "rate" ? `${m >= 0 ? "+" : "−"}${Math.abs(Math.round(m * 100))}%p` : `${m >= 0 ? "+" : "−"}${Math.abs(m).toFixed(2)}`);
  return (
    <div>
      <h3 className="mb-1.5 text-[12px] font-semibold text-fg-3">{title}</h3>
      {rows.length ? (
        <ul className="space-y-1 text-[12.5px]">
          {rows.map(([k, e]) => (
            <li key={k} className="flex items-baseline gap-2">
              <span className={cx("tabular w-16 shrink-0 font-mono", e.mean >= 0 ? "text-good" : "text-warn")}>
                {e.mean >= 0 ? "▲" : "▼"} {fmt(e.mean)}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{k}</span>
              <span className="text-[11.5px] text-fg-4">{e.n}건</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-fg-4">표본이 아직 부족합니다.</p>
      )}
    </div>
  );
}

export function ArticleRank({ title, rows }: { title: string; rows: DeskModel["top"] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[12px] font-semibold text-fg-3">{title}</h3>
      {rows.length ? (
        <ol className="space-y-1 text-[12.5px]">
          {rows.map((a) => (
            <li key={a.slug} className="flex items-baseline gap-2">
              <Link href={`/a/${a.slug}`} className="min-w-0 flex-1 truncate text-fg-2 hover:text-ice">
                {a.title}
              </Link>
              <span className="tabular shrink-0 font-mono text-[11.5px] text-fg-4">
                조회 {a.views} · 완독 {Math.round(a.readRate * 100)}%
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[12.5px] text-fg-4">측정된 기사가 5건 이상이면 보여 줍니다.</p>
      )}
    </div>
  );
}

/* ───────────────────────── runs ───────────────────────── */

export function RunsTable({ runs }: { runs: DeskAdmin["runs"] }) {
  if (!runs.length) return <p className="p-4 text-[12.5px] text-fg-4">아직 실행 기록이 없습니다.</p>;
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th className={table.th}>시작</th>
            <th className={table.th}>방식</th>
            <th className={cx(table.th, "text-right")}>자료</th>
            <th className={cx(table.th, "text-right")}>사건</th>
            <th className={cx(table.th, "text-right")}>초안</th>
            <th className={cx(table.th, "text-right")}>비용</th>
            <th className={table.th}>메모</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className={table.row}>
              <td className={cx(table.td, "whitespace-nowrap")}>
                <Ago iso={r.startedAt} />
              </td>
              <td className={table.td}>{r.trigger === "manual" ? "수동" : "자동"}</td>
              <td className={cx(table.td, "tabular text-right font-mono")}>{r.itemsSeen}</td>
              <td className={cx(table.td, "tabular text-right font-mono")}>{r.stories}</td>
              <td className={cx(table.td, "tabular text-right font-mono")}>{r.drafted}</td>
              <td className={cx(table.td, "tabular text-right font-mono")}>${r.costUsd.toFixed(3)}</td>
              <td className={cx(table.td, "max-w-[28rem] text-[12px]", r.error ? "text-bad" : "text-fg-3")}>
                {r.finishedAt ? r.note : "진행 중…"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Notice({ tone, children }: { tone: "warn" | "bad" | "ice"; children: ReactNode }) {
  const tones = { warn: "border-warn/40 text-warn", bad: "border-bad/40 text-bad", ice: "border-ice/40 text-ice" };
  return <p className={cx("rounded-lg border bg-bg-1/60 px-3 py-2 text-[12.5px]", tones[tone])}>{children}</p>;
}
