import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAutoAdmin } from "@/data/admin-auto";
import { AutoSettingForm } from "@/components/admin/auto/AutoSettingForm";
import { Ago } from "@/components/admin/feeds/time";
import { Card, PageHeader, StatusBadge } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";

export const metadata: Metadata = { title: "자동 기사" };

export default function AutoArticlesPage() {
  return (
    <Suspense fallback={<PageHeader kicker="AUTO DESK" title="자동 기사" />}>
      <Body />
    </Suspense>
  );
}

async function Body() {
  const d = await getAutoAdmin();
  return (
    <>
      <PageHeader
        kicker="AUTO DESK"
        title="자동 기사"
        description="데이터로만 쓰는 기사입니다. 숫자는 원천 데이터에서, 문장은 고정 템플릿에서 나옵니다. 유형마다 끄기·검토 후 발행·자동 발행을 고르세요. 자동 발행도 필수 체크를 통과할 때만 나가고, 막히면 사유와 함께 검토 단계로 돌아옵니다."
      />
      <div className="space-y-4 px-4 py-5 sm:px-6">
        {d.rows.map((r) => (
          <Card
            key={r.id}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {r.label}
                <BeatChip beat={r.beat} />
              </span>
            }
          >
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <p className="text-[13px] text-fg-2">{r.description}</p>
                <p className="text-[12px] text-fg-4">
                  {r.trigger.kind === "daily" ? "정기 · 하루 한 번" : r.trigger.kind === "event" ? `이벤트 · ${r.trigger.detail}` : "수동"} · 최근 7일 {r.made7d}건 만듦, {r.published7d}건 발행
                </p>
                <AutoSettingForm
                  template={r.id}
                  label={r.label}
                  initial={r.setting}
                  kind={r.trigger.kind === "daily" ? "daily" : r.id === "crypto_move" ? "move" : "event"}
                />
                {r.warnings.length > 0 && (
                  <ul className="space-y-1 text-[12.5px] text-warn">
                    {r.warnings.map((w, i) => (
                      <li key={i}>
                        {w.href ? (
                          <Link href={w.href} className="underline-offset-2 hover:underline">
                            {w.text}
                          </Link>
                        ) : (
                          w.text
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-[12px] font-semibold text-fg-3">최근에 만든 기사</h3>
                {r.recent.length ? (
                  <ul className="space-y-2 text-[13px]">
                    {r.recent.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <StatusBadge status={c.status} />
                        <Link href={c.articleSlug ? `/a/${c.articleSlug}` : `/admin/candidates/${c.id}`} className="min-w-0 flex-1 truncate text-fg-2 hover:text-ice">
                          {c.title}
                        </Link>
                        <span className="text-[12px] text-fg-4">
                          <Ago iso={c.createdAt} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] text-fg-4">아직 없습니다.</p>
                )}
              </div>
            </div>
          </Card>
        ))}
        <p className="text-[12.5px] text-fg-4">
          코스피·코스닥 장 마감 시황처럼 수동으로만 쓰는 템플릿은{" "}
          <Link href="/admin" className="text-ice hover:underline">
            대시보드
          </Link>
          의 ‘데이터 자동 기사’에서 바로 만들 수 있습니다. 자동 발행은 웹 서비스의 예약 발행 스케줄러가 1분마다 처리합니다{d.schedulerOn ? "." : " — 지금은 꺼져 있습니다 (SCHEDULER=off)."}
        </p>
      </div>
    </>
  );
}
