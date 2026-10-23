import type { Metadata } from "next";
import { Suspense } from "react";
import { getDeskAdmin } from "@/data/admin-desk";
import { ActionButton } from "@/components/admin/client";
import { DeskSettingsForm } from "@/components/admin/desk/DeskSettingsForm";
import { PlaybookEditor } from "@/components/admin/desk/PlaybookEditor";
import { ArticleRank, DecisionList, Effects, Notice, PHASE, RunsTable, TrafficBar } from "@/components/admin/desk/views";
import { Ago } from "@/components/admin/feeds/time";
import { Badge, Card, PageHeader, Stat } from "@/components/admin/ui";
import { modelInfo } from "@/lib/ai/models";
import { requestDeskRun, requestReflection } from "@/server/actions/desk";
import { QUEUE_HOURS } from "@/server/desk/run";
import { DESK_CADENCES, DESK_DRAFT_MODELS, DESK_TRIAGE_MODELS } from "@/server/desk/settings";

export const metadata: Metadata = { title: "AI 데스크" };

const DESCRIPTION =
  "피드에서 기사가 될 만한 소식을 골라 초안을 씁니다. 초안은 후보 보드의 ‘검토’로 들어가고, 발행은 편집자가 합니다. 독자 반응과 편집자의 발행·반려를 보고 고르는 기준을 고쳐 나갑니다.";

export default function DeskPage() {
  return (
    <Suspense fallback={<PageHeader kicker="AI DESK" title="AI 데스크" description={DESCRIPTION} />}>
      <Body />
    </Suspense>
  );
}

const cadenceLabel = (m: number) => (m < 60 ? `${m}분마다` : `${m / 60}시간마다`);

async function Body() {
  const d = await getDeskAdmin();
  const s = d.settings;
  const m = d.model;
  const budgetHit = d.spend.deskUsd >= s.monthlyBudgetUsd || d.spend.allUsd >= d.spend.capUsd;
  const drafted = d.decisions.filter((x) => x.candidate || x.waiting);
  const held = d.decisions.filter((x) => !x.candidate && !x.waiting && x.decision === "hold");
  const skipped = d.decisions.filter((x) => !x.candidate && !x.waiting && x.decision !== "hold");
  const editorRate = m.editor.total ? Math.round((m.editor.published / m.editor.total) * 100) : null;

  return (
    <>
      <PageHeader
        kicker="AI DESK"
        title="AI 데스크"
        description={DESCRIPTION}
        actions={
          <>
            <Badge tone={s.enabled ? "good" : "neutral"}>{s.enabled ? `켜짐 · ${cadenceLabel(s.cadenceMin)}` : "꺼짐"}</Badge>
            <ActionButton action={requestDeskRun} args={{}} variant="primary" title="워커가 1분 안에 한 번 실행합니다">
              지금 실행
            </ActionButton>
          </>
        }
      />
      <div className="space-y-4 px-4 py-5 sm:px-6">
        {(!d.worker.hasKey || !d.worker.alive || budgetHit || d.pending.run) && (
          <div className="space-y-2">
            {!d.worker.alive && <Notice tone="bad">워커 신호가 3분 넘게 없습니다{d.worker.lastBeat ? "" : " (아직 한 번도 없음)"}. Railway에서 worker 서비스가 돌고 있는지 확인하세요.</Notice>}
            {!d.worker.hasKey && <Notice tone="bad">워커에 ANTHROPIC_API_KEY가 없어 AI 데스크가 쉬고 있습니다. Railway worker 서비스 변수에 키를 넣으세요.</Notice>}
            {budgetHit && (
              <Notice tone="warn">
                이번 달 예산을 다 써서 쉬고 있습니다 — 데스크 ${d.spend.deskUsd.toFixed(2)} / ${s.monthlyBudgetUsd}, 뉴스룸 전체 ${d.spend.allUsd.toFixed(2)} / ${d.spend.capUsd}.
              </Notice>
            )}
            {d.pending.run && <Notice tone="ice">실행 요청을 받았습니다. 워커가 1분 안에 시작합니다.</Notice>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat
            label="오늘 초안"
            value={`${d.today.drafted} / ${s.dailyDrafts}`}
            sub={d.today.allowedNow ? `지금까지 쓸 수 있는 몫 ${d.today.allowedNow}건` : "07시부터 나눠 씁니다 (속보급은 먼저)"}
          />
          <Stat label="대기" value={d.today.queued} sub={`${QUEUE_HOURS}시간 안에 차례가 오면 씁니다`} />
          <Stat label="30일 결과" value={`${d.outcomes30d.published} 발행`} sub={`반려 ${d.outcomes30d.rejected} · 검토 중 ${d.outcomes30d.review}`} />
          <Stat
            label="이번 달 비용"
            value={`$${d.spend.deskUsd.toFixed(2)}`}
            sub={`예산 $${s.monthlyBudgetUsd} · 뉴스룸 전체 $${d.spend.allUsd.toFixed(2)} / $${d.spend.capUsd}`}
            tone={budgetHit ? "warn" : undefined}
          />
          <Stat label="학습 단계" value={PHASE[m.phase].label} sub={`측정 기사 ${m.measured}건 · 편집 결정 ${m.editor.total}건`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Card title={`초안 · 대기 — 최근 24시간 ${drafted.length}건`} pad={false}>
              <DecisionList rows={drafted} empty="아직 고른 소식이 없습니다. 실행 간격마다 새 자료를 읽습니다." />
            </Card>
            <Card title={`보류 — 1차 자료 확인이 먼저인 소식 ${held.length}건`} pad={false}>
              <DecisionList rows={held} empty="보류한 소식이 없습니다." />
            </Card>
            <details className="panel overflow-hidden">
              <summary className="hud cursor-pointer px-4 py-2.5 text-fg-3 hover:text-fg-2">제외 {skipped.length}건 펼치기</summary>
              <div className="border-t border-line">
                <DecisionList rows={skipped} empty="제외한 소식이 없습니다." />
              </div>
            </details>
          </div>

          <div className="space-y-4">
            <Card title="설정">
              <DeskSettingsForm
                initial={s}
                cadences={DESK_CADENCES.map((c) => ({ value: c, label: cadenceLabel(c) }))}
                triageModels={DESK_TRIAGE_MODELS.map((x) => ({ value: x, label: modelInfo(x).label }))}
                draftModels={DESK_DRAFT_MODELS.map((x) => ({ value: x, label: modelInfo(x).label }))}
              />
            </Card>
            <Card title="자동 발행">
              <p className="text-[12.5px] leading-relaxed text-fg-3">
                지금은 모든 초안이 편집자 검토를 거칩니다. 위험 점수 20 이하, 근거 점수 70 이상, 공식·1차 출처, 라이선스 검토 완료, 체크 통과를 모두 만족한 초안에는 ‘저위험’ 표시가 붙습니다.
                표시가 실제 판단과 맞는지 지켜본 뒤 일부를 자동 발행으로 돌릴 수 있습니다.
              </p>
            </Card>
          </div>
        </div>

        <Card title="학습 현황">
          <div className="space-y-5">
            <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
              <p className="max-w-3xl text-[13px] leading-relaxed text-fg-2">
                <span className="font-semibold text-fg">{PHASE[m.phase].label}</span> — {PHASE[m.phase].text}
              </p>
              <p className="text-[12px] text-fg-4">{m.computedAt ? <>갱신 <Ago iso={m.computedAt} /></> : "아직 계산 전 (워커가 3시간마다 갱신)"}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12.5px] text-fg-3 sm:grid-cols-4">
              <p>
                기사당 조회 중앙값 <span className="tabular font-mono text-fg-2">{m.medianViews}</span>
              </p>
              <p>
                평균 완독률 <span className="tabular font-mono text-fg-2">{Math.round(m.readRate * 100)}%</span>
              </p>
              <p>
                데스크 초안 발행률 <span className="tabular font-mono text-fg-2">{editorRate == null ? "—" : `${editorRate}%`}</span>
              </p>
              <p>
                반영 비중 <span className="tabular font-mono text-fg-2">{Math.round(m.confidence * 100)}%</span>
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-[12px] font-semibold text-fg-3">유입 경로 (30일)</h3>
              <TrafficBar traffic={m.traffic} />
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <Effects title="독자 반응 — 주제" rec={m.reader.topic} unit="z" />
              <Effects title="독자 반응 — 분야·시간대" rec={{ ...m.reader.beat, ...m.reader.hour }} unit="z" />
              <Effects title="편집자 발행 — 주제" rec={m.editor.topic} unit="rate" />
              <Effects title="편집자 발행 — 분야" rec={m.editor.beat} unit="rate" />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <ArticleRank title="반응이 좋았던 기사" rows={m.top} />
              <ArticleRank title="반응이 약했던 기사" rows={m.bottom} />
            </div>
          </div>
        </Card>

        <Card
          title={`편집 지침 v${d.playbook.version}`}
          actions={
            <div className="flex items-center gap-2">
              <ActionButton action={requestReflection} args={{}} title="독자 반응과 편집자 결정을 보고 지침을 다시 씁니다">
                {d.pending.reflect ? "검토 대기 중…" : "AI 검토 요청"}
              </ActionButton>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-[12px] text-fg-4">
              {d.playbook.source === "ai" ? "AI 검토로 고친 버전" : d.playbook.source === "editor" ? "편집자가 고친 버전" : "처음 지침"} · <Ago iso={d.playbook.createdAt} />
              {d.reflectedAt && (
                <>
                  {" "}
                  · 마지막 검토 <Ago iso={d.reflectedAt} />
                </>
              )}
              {d.playbook.notes && <span className="block whitespace-pre-line pt-1 text-fg-3">{d.playbook.notes}</span>}
            </p>
            <p className="whitespace-pre-line rounded-lg border border-line bg-bg-1/50 p-3 text-[13px] leading-relaxed text-fg-2">{d.playbook.body}</p>
            <PlaybookEditor body={d.playbook.body} version={d.playbook.version} />
            {d.history.length > 1 && (
              <details>
                <summary className="cursor-pointer text-[12.5px] text-fg-3 hover:text-fg-2">이전 버전 {d.history.length - 1}개</summary>
                <ol className="mt-2 space-y-3">
                  {d.history.slice(1).map((h) => (
                    <li key={h.version} className="text-[12.5px]">
                      <p className="text-fg-3">
                        v{h.version} · {h.source === "ai" ? "AI 검토" : h.source === "editor" ? (h.by ?? "편집자") : "처음 지침"} · <Ago iso={h.createdAt} />
                        {h.notes && <span className="text-fg-4"> — {h.notes.replace(/\n/g, " / ")}</span>}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-fg-4">{h.body}</p>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        </Card>

        <Card title="최근 실행" pad={false}>
          <RunsTable runs={d.runs} />
        </Card>
      </div>
    </>
  );
}
