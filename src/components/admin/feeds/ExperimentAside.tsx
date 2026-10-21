import Link from "next/link";
import { Badge, btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { dateTimeKST } from "@/lib/format";
import { SOURCE_STATUS_LABEL } from "@/lib/labels";
import type { SourceStatus } from "@/db/schema";

const TONE: Record<SourceStatus, "good" | "neutral" | "bad"> = { active: "good", paused: "neutral", error: "bad" };

/** Sources attached to a hypothesis + its timeline (edit page). */
export function ExperimentAside({
  experiment,
  sources,
}: {
  experiment: { id: string; code: string; status: string; startedAt: string | null; endedAt: string | null; createdAt: string } | null;
  sources: Array<{ id: string; name: string; slug: string; status: SourceStatus }>;
}) {
  if (!experiment) {
    return (
      <section className="panel p-4">
        <h2 className="kicker mb-3 text-fg-3">좋은 가설의 조건</h2>
        <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-fg-3">
          <li>
            <strong className="font-semibold text-fg-2">바꾸는 것 하나</strong> — 소스 묶음이나 작성 방식 중 무엇을 다르게 하는지 분명히 합니다.
          </li>
          <li>
            <strong className="font-semibold text-fg-2">지표 하나</strong> — 성패를 가를 주 지표를 미리 정합니다. 결과를 보고 지표를 고르지 않습니다.
          </li>
          <li>
            <strong className="font-semibold text-fg-2">반증 가능</strong> — “얼마나”를 적습니다. 예: 완독률 10%p 이상.
          </li>
          <li>
            <strong className="font-semibold text-fg-2">기간</strong> — 최소 2주는 돌려야 요일 효과가 걸러집니다.
          </li>
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-fg-3">저장한 뒤 소스 편집 화면에서 이 가설에 소스를 연결하면 퍼널 집계가 시작됩니다.</p>
      </section>
    );
  }
  return (
    <div className="space-y-4">
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="kicker text-fg-3">연결된 소스</h2>
          <span className="tabular font-mono text-[11px] text-fg-3">{sources.length}</span>
        </div>
        {sources.length ? (
          <ul>
            {sources.map((s) => (
              <li key={s.id} className="border-b border-line last:border-b-0">
                <Link href={`/admin/sources/${s.id}`} className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-bg-2/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-fg-2">{s.name}</span>
                    <span className="block font-mono text-[11px] text-fg-4">{s.slug}</span>
                  </span>
                  <Badge tone={TONE[s.status]}>{SOURCE_STATUS_LABEL[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-5 text-[12.5px] text-fg-3">아직 연결된 소스가 없습니다.</p>
        )}
        <div className="border-t border-line p-3">
          <Link href={`/admin/sources/new?experiment=${experiment.id}`} className={cx(btn.base, btn.ghost, "w-full")}>
            <Icon name="plus" size={14} /> 이 가설에 소스 추가
          </Link>
        </div>
      </section>
      <section className="panel p-4">
        <h2 className="kicker mb-3 text-fg-3">기록</h2>
        <dl className="grid grid-cols-[56px_minmax(0,1fr)] gap-y-1.5 text-[12.5px]">
          <dt className="text-fg-3">등록</dt>
          <dd className="tabular text-fg-2">{dateTimeKST(experiment.createdAt)}</dd>
          <dt className="text-fg-3">시작</dt>
          <dd className="tabular text-fg-2">{experiment.startedAt ? dateTimeKST(experiment.startedAt) : "—"}</dd>
          <dt className="text-fg-3">종료</dt>
          <dd className="tabular text-fg-2">
            {experiment.endedAt ? dateTimeKST(experiment.endedAt) : experiment.status === "running" ? "진행 중" : experiment.status === "paused" ? "— (일시중지)" : "—"}
          </dd>
        </dl>
        <Link
          href={`/admin/feeds?status=all&experiment=${experiment.code}`}
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-fg-3 hover:text-fg"
        >
          이 가설의 수집 항목 보기 <Icon name="arrowRight" size={12} />
        </Link>
      </section>
    </div>
  );
}
