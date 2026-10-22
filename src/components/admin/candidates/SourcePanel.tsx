import { clockKST, dateKST } from "@/lib/format";
import { detachItem } from "@/server/actions/candidates";
import { ActionButton } from "@/components/admin/client";
import { Badge, LicenseIcons, ScoreBar, TrustBadge } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { LocalTime } from "@/components/ui/LocalTime";
import type { CandidateBundle } from "./shared";

/**
 * Left column of the editor: what the draft is built from. Server-rendered and
 * handed to the client editor as a slot; detaching an item refreshes it.
 */
export function SourcePanel({ bundle }: { bundle: CandidateBundle }) {
  const c = bundle.candidate;
  const readOnly = c.status === "published";
  const wasRejected = c.aiNote?.startsWith("반려: ") ?? false;
  const rejectReason = c.status === "rejected" && wasRejected ? c.aiNote!.slice(4) : null;
  const pastReject = c.status !== "rejected" && wasRejected ? c.aiNote!.slice(4) : null;
  const note = wasRejected ? null : c.aiNote;

  return (
    <div className="space-y-3">
      {rejectReason && (
        <div role="note" className="rounded-xl border border-bad/40 bg-bad/[0.06] px-3.5 py-3">
          <p className="kicker flex items-center gap-1.5 text-bad">
            <Icon name="alert" size={13} /> 반려 사유
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">{rejectReason}</p>
        </div>
      )}
      {pastReject && (
        <p className="rounded-xl border border-line-2 px-3.5 py-2.5 text-[12px] leading-relaxed text-fg-3">
          <span className="kicker mr-1.5 text-fg-2">이전 반려 사유</span>
          {pastReject}
        </p>
      )}
      {note && (
        <div role="note" className="rounded-xl border border-warn/40 bg-warn/[0.06] px-3.5 py-3">
          <p className="kicker flex items-center gap-1.5 text-warn">
            <Icon name="alert" size={13} /> AI 메모 · 발행 전 확인
          </p>
          <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-fg-2">
            {note.split(" · ").map((n, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-warn/70" aria-hidden="true" />
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {c.mode === "editor_idea" && c.idea && (
        <div className="rounded-xl border border-line-2 bg-bg-1 px-3.5 py-3">
          <p className="kicker text-fg-3">편집자 아이디어</p>
          <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-fg">{c.idea}</p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-fg-4">아이디어는 공개되지 않습니다. 사실은 1차 출처로 뒷받침해야 합니다.</p>
        </div>
      )}

      {c.generator && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-[11.5px] text-fg-4">
          <span className="hud text-fg-3">GEN</span>
          <span className="font-mono">
            {c.generator.id}@{c.generator.version}
          </span>
          {c.generator.model && (
            <>
              <span>·</span>
              <span className="font-mono">{c.generator.model}</span>
            </>
          )}
          {c.generator.usage && (
            <>
              <span>·</span>
              <span className="tabular" title={`입력 ${c.generator.usage.inputTokens.toLocaleString()} · 출력 ${c.generator.usage.outputTokens.toLocaleString()} 토큰`}>
                ${c.generator.usage.costUsd.toFixed(3)}
              </span>
            </>
          )}
          <span>·</span>
          <span className="tabular">
            {dateKST(c.generator.generatedAt)} {clockKST(c.generator.generatedAt)}
          </span>
        </p>
      )}

      {bundle.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-[12.5px] leading-relaxed text-fg-3">
          연결된 원천 자료가 없습니다.
          <br />
          {c.mode === "data_auto" ? "데이터 템플릿이 시세·지수에서 직접 수치를 가져왔습니다." : "본문 아래 ‘출처’에 공시·보도자료·데이터 같은 1차 출처를 직접 적어 주세요."}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {bundle.items.map((it) => (
            <li key={it.id} className="rounded-xl border border-line-2 bg-bg-1">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
                <Badge tone={it.role === "primary" ? "ice" : "neutral"}>{it.role === "primary" ? "주 자료" : "보조"}</Badge>
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-fg-2">{it.source.name}</span>
                <span className="ml-auto">
                  <TrustBadge tier={it.source.trustTier} />
                </span>
              </div>
              <div className="space-y-2 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <LicenseIcons
                    commercialOk={it.source.commercialOk}
                    redistributionOk={it.source.redistributionOk}
                    verbatimOk={it.source.verbatimOk}
                    reviewed={it.source.reviewed}
                    signalOnly={it.source.signalOnly}
                  />
                  <ScoreBar score={it.score} />
                </div>
                {it.source.signalOnly && (
                  <p className="flex gap-1.5 rounded-lg bg-warn/[0.08] px-2.5 py-1.5 text-[11.5px] leading-relaxed text-warn">
                    <Icon name="alert" size={13} className="mt-[2px] shrink-0" />
                    신호 전용 소스 — 문장을 재작성·인용하지 말고, 1차 자료로 확인한 사실만 쓰세요.
                  </p>
                )}
                <p className="text-[13px] font-semibold leading-snug text-fg">{it.title}</p>
                {it.summary && <p className="text-[12.5px] leading-relaxed text-fg-3">{it.summary}</p>}
                {it.entities.length > 0 && (
                  <p className="flex flex-wrap gap-1">
                    {it.entities.slice(0, 8).map((e) => (
                      <span key={e} className="rounded bg-bg-2 px-1.5 py-px text-[11px] text-fg-3">
                        {e}
                      </span>
                    ))}
                  </p>
                )}
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-4">
                  <Icon name="clock" size={12} />
                  <span className="tabular">
                    수집 <LocalTime iso={it.fetchedAt} within={72} />
                  </span>
                  <span className="font-mono uppercase">{it.lang}</span>
                  {it.source.attribution && <span className="truncate">표기: {it.source.attribution}</span>}
                </p>
                {Object.keys(it.payload).length > 0 && (
                  <details className="group rounded-lg border border-line">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[11.5px] text-fg-3 hover:text-fg [&::-webkit-details-marker]:hidden">
                      <Icon name="chevronRight" size={12} className="transition-transform group-open:rotate-90" />
                      원본 데이터 <span className="font-mono text-fg-4">payload</span>
                    </summary>
                    <pre className="max-h-56 overflow-auto border-t border-line px-2.5 py-2 font-mono text-[11px] leading-relaxed text-fg-2">
                      {JSON.stringify(it.payload, null, 2)}
                    </pre>
                  </details>
                )}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  {it.url ? (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-[12px] text-ice hover:underline">
                      <span className="truncate">{hostOf(it.url)}</span>
                      <Icon name="arrowUpRight" size={12} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="text-[11.5px] text-fg-4">원문 링크 없음</span>
                  )}
                  {!readOnly && (
                    <ActionButton
                      action={detachItem}
                      args={{ id: c.id, itemId: it.id }}
                      variant="quiet"
                      confirm={`‘${it.title.slice(0, 40)}’ 자료를 이 후보에서 분리할까요? 항목은 피드 인박스로 돌아갑니다.`}
                      className="h-7 px-2 text-[12px]"
                      title="후보에서 분리하고 인박스로 되돌리기"
                    >
                      분리
                    </ActionButton>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function hostOf(url: string) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.length > 1 ? u.pathname : ""}`;
  } catch {
    return url;
  }
}
