import Link from "next/link";
import type { getSourceActivity } from "@/data/admin-feeds";
import { Badge, cx, ScoreBar } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { dateTimeKST } from "@/lib/format";
import { rate } from "./labels";
import { SourceStatusToggle } from "./SourceStatusToggle";
import { Ago } from "./time";

type Activity = NonNullable<Awaited<ReturnType<typeof getSourceActivity>>>;

const STATUS_BADGE = { new: ["새 항목", "ice"], promoted: ["승격됨", "good"], dismissed: ["기각", "neutral"] } as const;

/** Health + recent intake for the source editor. */
export function SourceActivityAside({ id, name, slug, activity }: { id: string; name: string; slug: string; activity: Activity }) {
  const a = activity;
  return (
    <div className="space-y-4">
      <section className="panel p-4">
        <h2 className="kicker mb-3 text-fg-3">수집 상태</h2>
        <SourceStatusToggle id={id} name={name} status={a.status as "active" | "paused" | "error"} />
        {a.status === "error" && a.lastError && (
          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-bad/10 px-2.5 py-2 text-[12px] leading-snug text-bad" role="note">
            <Icon name="alert" size={13} className="mt-[2px] shrink-0" />
            {a.lastError}
          </p>
        )}
        <dl className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-y-1.5 text-[12.5px]">
          <dt className="text-fg-3">최근 수집</dt>
          <dd className="text-fg-2">{a.lastFetchedAt ? <Ago iso={a.lastFetchedAt} /> : "아직 없음"}</dd>
          <dt className="text-fg-3">등록</dt>
          <dd className="tabular text-fg-2">{dateTimeKST(a.createdAt)}</dd>
          <dt className="text-fg-3">검토</dt>
          <dd className="text-fg-2">
            {a.reviewedAt ? (
              <>
                {a.reviewedBy ?? "—"} · <span className="tabular">{dateTimeKST(a.reviewedAt)}</span>
              </>
            ) : (
              <span className="text-bad">미검토</span>
            )}
          </dd>
        </dl>
      </section>

      <section className="panel p-4">
        <h2 className="kicker mb-3 text-fg-3">최근 7일</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["수집", a.stats.items7d],
            ["승격", a.stats.promoted7d],
            ["기각", a.stats.dismissed7d],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg bg-bg-2/60 px-2 py-2.5">
              <p className="tabular text-[18px] font-bold leading-none text-fg">{v}</p>
              <p className="mt-1.5 text-[11.5px] text-fg-3">{l}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] text-fg-3">
          승격률 <span className="tabular font-semibold text-fg-2">{rate(a.stats.promoted7d, a.stats.items7d)}</span> · 24시간{" "}
          <span className="tabular font-semibold text-fg-2">{a.stats.items24h}</span>건 · 누적 <span className="tabular">{a.stats.total}</span>건
        </p>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="kicker text-fg-3">최근 수집 항목</h2>
          <Link href={`/admin/feeds?status=all&source=${slug}`} className="text-[12px] font-medium text-fg-3 hover:text-fg">
            인박스에서 보기 →
          </Link>
        </div>
        {a.recent.length ? (
          <ul>
            {a.recent.map((r) => {
              const [label, tone] = STATUS_BADGE[r.status];
              return (
                <li key={r.id} className="border-b border-line px-4 py-2.5 last:border-b-0">
                  <p className="line-clamp-2 text-[12.5px] font-medium leading-snug text-fg-2">{r.title}</p>
                  <p className={cx("mt-1.5 flex items-center gap-2 text-[11.5px] text-fg-3")}>
                    <ScoreBar score={r.score} />
                    <Badge tone={tone}>{label}</Badge>
                    <span className="ml-auto">
                      <Ago iso={r.fetchedAt} />
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-[12.5px] text-fg-3">아직 수집한 항목이 없습니다.</p>
        )}
      </section>
    </div>
  );
}

/** Checklist shown beside the "new source" form. */
export function NewSourceAside() {
  const steps = [
    ["이용약관을 먼저 읽습니다", "상업적 이용·재배포·원문 인용 가능 여부를 확인하고 약관 주소를 남깁니다."],
    ["신뢰 등급을 정합니다", "1차 원천(T1)인지, 커뮤니티 집계(T3)인지에 따라 기사에서의 무게가 달라집니다."],
    ["신호 전용인지 판단합니다", "타 매체 기사나 유료 콘텐츠는 단서로만 쓰고 내용은 쓰지 않습니다."],
    ["가설에 연결합니다", "어떤 실험의 소스인지 지정해야 퍼널 비교에 잡힙니다."],
  ];
  return (
    <section className="panel p-4">
      <h2 className="kicker mb-3 text-fg-3">등록 전 확인</h2>
      <ol className="space-y-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="tabular mt-px flex size-5 shrink-0 items-center justify-center rounded-md border border-line-2 font-mono text-[11px] font-bold text-fg-2">
              {i + 1}
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-fg">{t}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-3">{d}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 border-t border-line pt-3 text-[12px] leading-relaxed text-fg-3">
        라이선스 검토 전 소스의 항목은 인박스에 들어오지만, 발행 전 자동 점검에서 차단됩니다.
      </p>
    </section>
  );
}
