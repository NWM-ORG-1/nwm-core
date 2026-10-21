import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getArticleAdmin } from "@/data/admin";
import { getArticleSidecar, getArticleTitle } from "@/data/admin-articles";
import { compactKo } from "@/lib/format";
import { Badge, btn, cx } from "@/components/admin/ui";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { AiLabel, BreakingBadge, MiniStat, PublishState, SampleBadge, Section } from "@/components/admin/articles/bits";
import { CorrectionRequests } from "@/components/admin/articles/CorrectionRequests";
import { DailyViews, type DayStat } from "@/components/admin/articles/DailyViews";
import {
  ACTIVITY_KIND_LABEL,
  CORRECTION_KIND_LABEL,
  dateTimeKST,
  fmtDwell,
  fmtRate,
  rate,
  requestClock,
  shortDateTime,
  shortDay,
  untilLabel,
} from "@/components/admin/articles/labels";
import { PublishControls } from "@/components/admin/articles/PublishControls";
import { ReviseProvider } from "@/components/admin/articles/ReviseContext";
import { ReviseForm } from "@/components/admin/articles/ReviseForm";
import { RevisionHistory } from "@/components/admin/articles/RevisionHistory";

export async function generateMetadata({ params }: PageProps<"/admin/articles/[id]">): Promise<Metadata> {
  // A missing article still gets its 404 UI from the page body (notFound() there).
  const title = await getArticleTitle((await params).id);
  return { title: title ? `${title} · 기사 관리` : "기사를 찾을 수 없음" };
}

export default function ArticleAdminPage({ params }: PageProps<"/admin/articles/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getArticleAdmin(id);
  if (!bundle) notFound();
  const { article: a, revisions, corrections, requests, stats, stories } = bundle;
  const side = await getArticleSidecar(a.id, {
    staffIds: [...revisions.map((r) => r.editedBy), ...corrections.map((c) => c.createdBy)],
    requestIds: requests.map((r) => r.id),
  });
  if (!side) notFound();
  const now = side.now;

  // 14-day series, zero-filled on days without traffic.
  const byDay = new Map(stats.map((s) => [s.day, s]));
  const series: DayStat[] = side.days.map((day) => byDay.get(day) ?? { day, views: 0, reads: 0, nexts: 0, dwellMs: 0 });
  const t = series.reduce((x, d) => ({ views: x.views + d.views, reads: x.reads + d.reads, nexts: x.nexts + d.nexts, dwellMs: x.dwellMs + d.dwellMs }), {
    views: 0,
    reads: 0,
    nexts: 0,
    dwellMs: 0,
  });

  const openRequests = requests.filter((r) => r.status === "open").sort((x, y) => x.receivedAt.localeCompare(y.receivedAt));
  const oldest = openRequests[0] ? requestClock(openRequests[0].receivedAt, now) : null;
  const featured = a.featuredUntil && new Date(a.featuredUntil).getTime() > now;
  const updated = new Date(a.updatedAt).getTime() - new Date(a.publishedAt).getTime() > 60_000;
  const editorName = a.editor?.name ?? a.author?.name ?? null;
  const unpublishReason =
    a.status === "unpublished" ? (side.activity.find((x) => x.kind === "unpublish")?.summary.replace(/^비공개 전환:\s*/, "") ?? null) : null;

  return (
    <ReviseProvider>
      <header className="border-b border-line px-4 pb-5 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="이동 경로" className="hud flex items-center gap-2 text-fg-3">
            <Link href="/admin/articles" className="rounded hover:text-fg">
              ARTICLES
            </Link>
            <span aria-hidden="true">/</span>
            <span className="normal-case text-ice">{a.slug}</span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/articles" className={cx(btn.base, btn.quiet)}>
              <Icon name="arrowLeft" size={14} /> 목록
            </Link>
            {a.candidateId && (
              <Link href={`/admin/candidates/${a.candidateId}`} className={cx(btn.base, btn.ghost)}>
                원 후보
              </Link>
            )}
            {a.status === "published" ? (
              <a href={`/a/${a.slug}`} target="_blank" rel="noreferrer" className={cx(btn.base, btn.ghost)}>
                보기 <span aria-hidden="true">↗</span>
                <span className="sr-only">(새 탭)</span>
              </a>
            ) : (
              <span className={cx(btn.base, "cursor-not-allowed border border-line text-fg-4")} title="비공개 기사는 독자 화면에 없습니다">
                보기 ↗
              </span>
            )}
          </div>
        </div>

        <h1 className="mt-3 max-w-4xl text-[22px] font-bold leading-snug tracking-[-0.02em] text-fg sm:text-[24px]">{a.title}</h1>
        <p className="mt-1.5 max-w-4xl text-[14px] leading-relaxed text-fg-3">{a.dek}</p>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <PublishState status={a.status} />
          <BeatChip beat={a.beat} size="md" />
          <AiLabel value={a.aiInvolvement} editorName={editorName} long />
          {a.isBreaking && <BreakingBadge />}
          {featured && (
            <Badge tone="ice" title={dateTimeKST(a.featuredUntil!)}>
              Top · ~{untilLabel(a.featuredUntil!, now)}
            </Badge>
          )}
          {a.isSample && <SampleBadge />}
          {a.story && (
            <span className="max-w-[320px] truncate text-[12.5px] text-fg-3" title={a.story.title}>
              스토리 · {a.story.title}
            </span>
          )}
        </div>

        <dl className="tabular mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
          <div className="flex gap-1.5">
            <dt className="text-fg-4">발행</dt>
            <dd className="font-mono text-fg-2">{dateTimeKST(a.publishedAt)}</dd>
          </div>
          {updated && (
            <div className="flex gap-1.5">
              <dt className="text-fg-4">최종 수정</dt>
              <dd className="font-mono text-fg-2">{dateTimeKST(a.updatedAt)}</dd>
            </div>
          )}
          <div className="flex gap-1.5">
            <dt className="text-fg-4">버전</dt>
            <dd className="font-mono text-fg-2">
              r{a.revision}
              {corrections.length ? ` · 정정 ${corrections.length}건` : ""}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-4">바이라인</dt>
            <dd className="text-fg-2">{a.byline}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-fg-4">주소</dt>
            <dd className="font-mono text-fg-2">/a/{a.slug}</dd>
          </div>
        </dl>
      </header>

      <div className="space-y-4 px-4 py-5 sm:px-6">
        {(oldest || a.status === "unpublished") && (
          <div className="space-y-2">
            {oldest && (
              <a
                href="#requests"
                className={cx(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-[13px] transition-colors",
                  oldest.tone === "bad" ? "border-bad/40 bg-bad/[0.07] hover:bg-bad/10" : "border-warn/40 bg-warn/[0.06] hover:bg-warn/10",
                )}
              >
                <Icon name="alert" size={15} className={oldest.tone === "bad" ? "text-bad" : "text-warn"} />
                <span className="font-semibold text-fg">미처리 정정·반론 요청 {openRequests.length}건</span>
                <span className="tabular text-fg-2">
                  가장 오래된 요청 {oldest.elapsedDays}일 경과 · 게재 기한 {shortDay(oldest.publishBy)} (
                  {oldest.daysLeft > 0 ? `D-${oldest.daysLeft}` : oldest.daysLeft === 0 ? "D-day" : `${-oldest.daysLeft}일 초과`})
                </span>
                <span className="ml-auto text-[12.5px] text-fg-3">처리하기 ↓</span>
              </a>
            )}
            {a.status === "unpublished" && (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warn/40 bg-warn/[0.06] px-4 py-2.5 text-[13px]">
                <Icon name="info" size={15} className="text-warn" />
                <span className="font-semibold text-fg">비공개 상태</span>
                <span className="text-fg-2">독자 화면·목록·검색에서 내려가 있습니다.{unpublishReason ? ` 사유: ${unpublishReason}` : ""}</span>
              </p>
            )}
          </div>
        )}

        {/* xl: main column spans both rows; the rail is split so phones get controls first and history last */}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_336px] xl:grid-rows-[auto_1fr]">
          <aside className="space-y-4 xl:col-start-2 xl:row-start-1" aria-label="발행 관리와 지표">
            <Section title="발행 관리" kicker="PUBLISHING">
              <PublishControls
                id={a.id}
                status={a.status}
                featuredUntil={a.featuredUntil}
                now={now}
                story={a.story}
                stories={stories}
                unpublishReason={unpublishReason}
              />
            </Section>

            <Section title="14일 지표" kicker="14D METRICS">
              <DailyViews series={series} />
              <div className="mt-4 grid grid-cols-2 gap-2">
                <MiniStat label="14일 조회" value={compactKo(t.views)} sub={`완독 ${compactKo(t.reads)}`} />
                <MiniStat label="완독률" value={fmtRate(rate(t.reads, t.views))} sub="완독 / 조회" />
                <MiniStat label="다음 이동률" value={fmtRate(rate(t.nexts, t.views))} sub="다음 기사 / 조회" />
                <MiniStat label="평균 체류" value={fmtDwell(t.reads ? t.dwellMs / t.reads : null)} sub="완독 1회당" />
              </div>
            </Section>

          </aside>

          <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
            <Section
              id="requests"
              tone={oldest?.tone === "bad" ? "bad" : undefined}
              title={
                <>
                  정정·반론 요청
                  <span className="text-[12px] font-normal text-fg-3">언론중재법</span>
                  {openRequests.length > 0 && <Badge tone="bad">미처리 {openRequests.length}</Badge>}
                </>
              }
              lead={
                <>
                  언론중재법 제15·16조 — 청구를 받은 날부터 <b className="font-semibold text-fg-2">3일 안에 수용 여부를 청구인에게 회신</b>하고, 수용하면{" "}
                  <b className="font-semibold text-fg-2">7일 안에 정정·반론 보도문을 게재</b>해야 합니다. 경과 5일 이상은 빨간색으로 표시합니다.
                </>
              }
            >
              <CorrectionRequests
                articleId={a.id}
                requests={requests.map((r) => ({
                  id: r.id,
                  receivedAt: r.receivedAt,
                  requester: r.requester,
                  channel: r.channel,
                  claim: r.claim,
                  status: r.status,
                  resolvedAt: r.resolvedAt,
                  correctionId: r.correctionId,
                }))}
                corrections={corrections.map((c) => ({ id: c.id, revision: c.revision, kind: c.kind }))}
                log={side.requestLog}
                now={now}
              />
            </Section>

            <Section
              id="revise"
              title={
                <>
                  수정·정정
                  <span className="tabular font-mono text-[12px] font-normal text-fg-3" title="저장하면 만들어지는 버전">
                    r{a.revision} <span aria-hidden="true">→</span>
                    <span className="sr-only">에서</span> <span className="text-ice">r{a.revision + 1}</span>
                  </span>
                </>
              }
              kicker="REVISION"
              lead="저장하면 새 버전이 만들어지고 즉시 반영됩니다. 사실관계가 바뀌는 수정은 정정 종류를 골라 공개 정정문을 함께 게시하세요."
            >
              <ReviseForm
                article={{ id: a.id, title: a.title, dek: a.dek, blocks: a.blocks, sentiment: a.sentiment, revision: a.revision, status: a.status }}
                openRequests={openRequests.map((r) => ({ id: r.id, requester: r.requester, channel: r.channel, receivedAt: r.receivedAt, claim: r.claim }))}
              />
            </Section>

            <Section
              id="revisions"
              title={
                <>
                  버전 이력 <span className="tabular font-mono text-[12px] font-normal text-fg-3">{revisions.length}</span>
                </>
              }
              lead="모든 수정은 버전으로 보존됩니다. 두 버전을 골라 제목·시그널·본문을 나란히 비교할 수 있습니다."
            >
              <RevisionHistory
                current={a.revision}
                corrections={corrections.map((c) => ({ revision: c.revision, kind: c.kind }))}
                revisions={revisions.map((r) => ({
                  revision: r.revision,
                  title: r.title,
                  dek: r.dek,
                  blocks: r.blocks,
                  reason: r.reason,
                  editor: (r.editedBy && side.staffNames[r.editedBy]) || null,
                  createdAt: r.createdAt,
                }))}
              />
            </Section>
          </div>

          <aside className="space-y-4 xl:col-start-2 xl:row-start-2" aria-label="정정 이력과 처리 기록">
            <Section
              title={
                <>
                  정정 이력 <span className="tabular font-mono text-[12px] font-normal text-fg-3">{corrections.length}</span>
                </>
              }
              lead="독자에게 공개된 정정문입니다. 기사 하단과 공개 정정 페이지에 게시됩니다."
            >
              {corrections.length === 0 ? (
                <p className="text-[12.5px] text-fg-3">공개된 정정이 없습니다.</p>
              ) : (
                <ol className="space-y-3">
                  {corrections.map((c) => (
                    <li key={c.id} className="border-l-2 border-warn/50 pl-3">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                        <Badge tone="warn">{CORRECTION_KIND_LABEL[c.kind]}</Badge>
                        <span className="tabular font-mono text-fg-2">r{c.revision}</span>
                        <time dateTime={c.publishedAt} className="tabular font-mono text-fg-3">
                          {shortDateTime(c.publishedAt)}
                        </time>
                        <span className="text-fg-3">{(c.createdBy && side.staffNames[c.createdBy]) || "편집국"}</span>
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{c.note}</p>
                    </li>
                  ))}
                </ol>
              )}
              <a href="/corrections" target="_blank" rel="noreferrer" className="mt-3 inline-block text-[12px] text-ice hover:underline">
                공개 정정 페이지 <span aria-hidden="true">↗</span>
              </a>
            </Section>

            {side.activity.length > 0 && (
              <Section title="처리 기록" kicker="ACTIVITY">
                <ol className="space-y-2">
                  {side.activity.map((x) => (
                    <li key={x.id} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 text-[12px]">
                      <span className="kicker pt-px !text-[11px] text-fg-3">{ACTIVITY_KIND_LABEL[x.kind] ?? x.kind}</span>
                      <span className="min-w-0">
                        <span className="block leading-snug text-fg-2 [overflow-wrap:anywhere]">{x.summary}</span>
                        <span className="tabular font-mono text-[11px] text-fg-4">
                          {shortDateTime(x.at)} · <span className="font-sans">{x.actor}</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
            )}
          </aside>
        </div>
      </div>
    </ReviseProvider>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      <div className="space-y-3 border-b border-line px-4 pb-5 pt-6 sm:px-6">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-7 w-full max-w-2xl" />
        <div className="skeleton h-4 w-full max-w-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-5 w-16" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-4">
          <div className="skeleton h-40" />
          <div className="skeleton h-[520px]" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-72" />
          <div className="skeleton h-64" />
        </div>
      </div>
    </div>
  );
}
