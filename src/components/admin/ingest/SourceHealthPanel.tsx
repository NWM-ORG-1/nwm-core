import type { getSourceHealth } from "@/data/admin-ingest";
import { Badge, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { Ago, Until } from "@/components/admin/feeds/time";
import { RunNowButton } from "./RunNowButton";

type Health = NonNullable<Awaited<ReturnType<typeof getSourceHealth>>>;

const OUTCOME: Record<string, [string, "good" | "neutral" | "warn" | "bad"]> = {
  ok: ["성공", "good"],
  not_modified: ["변경 없음", "neutral"],
  skipped: ["설정 필요", "warn"],
  error: ["실패", "bad"],
};

/** Collector health for one source: keys, last runs, notes, run-now. */
export function SourceHealthPanel({ id, health: h }: { id: string; health: Health }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="kicker text-fg-3">수집기</h2>
        {!h.isSample && h.adapter && <RunNowButton id={id} compact />}
      </div>
      {h.isSample ? (
        <p className="text-[12.5px] text-fg-3">샘플 소스는 수집하지 않습니다.</p>
      ) : !h.adapter ? (
        <p className="text-[12.5px] text-fg-3">수동 등록 소스이거나 워커가 모르는 어댑터입니다.</p>
      ) : (
        <>
          <p className="text-[12.5px] font-semibold text-fg-2">{h.adapter.label}</p>
          {h.credentials.length > 0 && (
            <ul className="mt-2 space-y-1">
              {h.credentials.map((c) => (
                <li key={c.name} className="flex items-center gap-2 font-mono text-[11.5px]" title={c.help}>
                  <span className={c.present ? "text-good" : c.required ? "text-bad" : "text-warn"}>{c.present ? "✓" : "✕"}</span>
                  {c.name}
                  {!c.present && <span className="font-sans text-fg-4">{c.required ? "필요" : "선택"}</span>}
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-y-1.5 text-[12.5px]">
            <dt className="text-fg-3">마지막 성공</dt>
            <dd className="text-fg-2">{h.lastSuccessAt ? <Ago iso={h.lastSuccessAt} /> : "아직 없음"}</dd>
            <dt className="text-fg-3">다음 수집</dt>
            <dd className="text-fg-2">
              <Until iso={h.nextRunAt} />
            </dd>
            {h.failCount > 0 && (
              <>
                <dt className="text-fg-3">연속 실패</dt>
                <dd className="text-bad">{h.failCount}회</dd>
              </>
            )}
          </dl>
          {h.lastError && (
            <p className="mt-3 flex items-start gap-1.5 rounded-md bg-bad/10 px-2.5 py-2 text-[12px] leading-snug text-bad" role="note">
              <Icon name="alert" size={13} className="mt-[2px] shrink-0" />
              {h.lastError}
            </p>
          )}
        </>
      )}
      {h.notes && <p className="mt-3 rounded-md bg-bg-2/60 px-2.5 py-2 text-[12px] leading-relaxed text-fg-3">{h.notes}</p>}
      {h.runs.length > 0 && (
        <ul className="mt-3 border-t border-line pt-2">
          {h.runs.map((r, i) => {
            const [label, tone] = OUTCOME[r.outcome] ?? [r.outcome, "neutral"];
            return (
              <li key={i} className="flex items-center gap-2 py-1 text-[11.5px] text-fg-3">
                <Badge tone={tone}>{label}</Badge>
                <span className={cx("tabular font-mono", r.inserted ? "text-fg-2" : "")}>+{r.inserted}</span>
                <span className="tabular font-mono">{r.durationMs}ms</span>
                <span className="min-w-0 flex-1 truncate" title={r.error ?? r.note ?? ""}>
                  {r.error ?? r.note ?? ""}
                </span>
                <Ago iso={r.at} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
