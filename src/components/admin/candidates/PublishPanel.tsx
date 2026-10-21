"use client";

import { useId, useState, useTransition, type Ref } from "react";
import type { AiInvolvement, CandidateStatus, CheckResult } from "@/db/schema";
import { AI_LABEL, aiLabelLong } from "@/lib/labels";
import { clockKST, dateKST } from "@/lib/format";
import { moveCandidate, runCandidateChecks, scheduleCandidate, unscheduleCandidate } from "@/server/actions/candidates";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { checkSummary } from "./ChecklistPanel";
import { defaultScheduleMs, f, kstInputToIso, toKstInput, type CheckLabels } from "./shared";
import { useNow } from "./time";

export interface Publishing {
  busy: "publish" | "override" | null;
  error: string | null;
  /** the last attempt stopped on blocking checks: offer the override form */
  blocked: boolean;
  dismissBlocked: () => void;
  publish: (overrideReason?: string) => void;
}

export function PublishPanel({
  candidateId,
  status,
  published,
  scheduledAt,
  ai,
  editorName,
  byline,
  storyTitle,
  checks,
  labels,
  articleSlug,
  invalid,
  publishing,
  flush,
  prepare,
  onChecks,
  onReject,
  onOpenChecks,
  publishRef,
  scheduleRef,
}: {
  candidateId: string;
  status: CandidateStatus;
  published: boolean;
  scheduledAt: string | null;
  ai: AiInvolvement;
  editorName: string;
  byline: string;
  storyTitle: string | null;
  checks: CheckResult[];
  labels: CheckLabels;
  articleSlug: string | null;
  invalid: boolean;
  publishing: Publishing;
  flush: () => Promise<boolean>;
  /** save + confirm the stored copy is ours; resolves the lockVersion to schedule, or null */
  prepare: () => Promise<number | null>;
  onChecks: (c: CheckResult[]) => void;
  onReject: () => void;
  onOpenChecks: () => void;
  publishRef?: Ref<HTMLButtonElement>;
  scheduleRef?: Ref<HTMLInputElement>;
}) {
  const id = useId();
  const now = useNow();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"schedule" | "unschedule" | "restore" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [at, setAt] = useState("");

  const sum = checkSummary(checks, labels);
  const machine = ai !== "human";
  const atValue = at || (now ? toKstInput(defaultScheduleMs(now)) : "");
  const minValue = now ? toKstInput(now + 2 * 60_000) : undefined;
  const working = pending || publishing.busy != null;

  const saveFirst = async () => {
    const ok = await flush();
    if (!ok) {
      setError(invalid ? "본문에 입력 오류가 있어 저장하지 못했습니다. 표시된 항목을 먼저 고치세요." : "최신 변경을 저장하지 못했습니다. 저장 상태를 확인하세요.");
      return false;
    }
    return true;
  };

  const publish = (overrideReason?: string) => {
    setError(null);
    setNotice(null);
    publishing.publish(overrideReason);
  };

  const schedule = () => {
    setError(null);
    setNotice(null);
    const iso = kstInputToIso(atValue);
    if (!iso) return setError("예약 시각을 입력하세요.");
    if (new Date(iso).getTime() < Date.now() + 60_000) return setError("예약 시각은 지금부터 1분 이후여야 합니다.");
    setBusy("schedule");
    start(async () => {
      const lockVersion = await prepare();
      if (lockVersion == null) {
        setError(invalid ? "본문에 입력 오류가 있어 저장하지 못했습니다. 표시된 항목을 먼저 고치세요." : "최신 변경을 저장하지 못했거나 다른 편집자가 초안을 바꿨습니다. 저장 상태를 확인하세요.");
        return setBusy(null);
      }
      const res = await scheduleCandidate({ id: candidateId, at: iso, lockVersion });
      setBusy(null);
      if (res?.ok) {
        setNotice(`${dateKST(iso)} ${clockKST(iso)} (KST)에 발행되도록 예약했습니다.`);
        setAt("");
      } else {
        setError(res && !res.ok ? res.error : "예약하지 못했습니다.");
        if (res && !res.ok && res.code === "blocked") {
          const r = await runCandidateChecks({ id: candidateId });
          if (r?.ok && r.data) onChecks(r.data.checks);
        }
      }
    });
  };

  const unschedule = () => {
    setError(null);
    setNotice(null);
    setBusy("unschedule");
    start(async () => {
      const res = await unscheduleCandidate({ id: candidateId });
      setBusy(null);
      if (res?.ok) setNotice("예약을 취소했습니다. 후보는 ‘검토’로 돌아갑니다.");
      else {
        setError(res && !res.ok ? res.error : "예약을 취소하지 못했습니다.");
      }
    });
  };

  const restore = () => {
    setError(null);
    setBusy("restore");
    start(async () => {
      if (!(await saveFirst())) return setBusy(null);
      const res = await moveCandidate({ id: candidateId, status: "drafting" });
      setBusy(null);
      if (res?.ok) setNotice("‘작성중’으로 되살렸습니다.");
      else {
        setError(res && !res.ok ? res.error : "되살리지 못했습니다.");
      }
    });
  };

  const spin = <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;

  return (
    <div className="space-y-4">
      {/* reader-facing label */}
      <section className="rounded-xl border border-line-2 bg-bg-1 p-3.5" aria-labelledby={`${id}-label`}>
        <h3 id={`${id}-label`} className="kicker text-fg-3">
          독자에게 보이는 표기
        </h3>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line-2 px-2 py-[3px] text-[11px] font-medium text-fg-3">
          <span className={cx("hud !text-[9px] !tracking-[0.12em]", machine ? "text-ice" : "text-fg-3")} aria-hidden="true">
            {machine ? "AI" : "HUMAN"}
          </span>
          {aiLabelLong(ai, editorName)}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-fg-3">{AI_LABEL[ai].explain}</p>
        <dl className="mt-3 grid grid-cols-[76px_1fr] gap-x-2 gap-y-1.5 border-t border-line pt-3 text-[12.5px]">
          <dt className="text-fg-4">책임 편집</dt>
          <dd className="text-fg-2">{ai === "auto" ? "없음 (데이터 자동)" : `${editorName} — 발행하는 편집자`}</dd>
          <dt className="text-fg-4">바이라인</dt>
          <dd className="text-fg-2">{byline}</dd>
          <dt className="text-fg-4">스토리</dt>
          <dd className={storyTitle ? "text-fg-2" : "text-fg-4"}>{storyTitle ?? "연결 안 함"}</dd>
        </dl>
      </section>

      {/* checks */}
      <section className="rounded-xl border border-line-2 bg-bg-1 p-3.5" aria-labelledby={`${id}-checks`}>
        <div className="flex items-center gap-2">
          <h3 id={`${id}-checks`} className="kicker text-fg-3">
            체크 요약
          </h3>
          <button type="button" onClick={onOpenChecks} className="ml-auto text-[12px] font-semibold text-ice hover:underline">
            체크리스트 →
          </button>
        </div>
        {sum.ran ? (
          <>
            <p className="mt-2 flex items-baseline gap-2">
              <span className={cx("tabular text-[22px] font-bold tracking-[-0.02em]", sum.failing.length ? "text-bad" : sum.missing.length ? "text-warn" : "text-good")}>
                {sum.passed}/{sum.total}
              </span>
              <span className="tabular text-[12px] text-fg-3">
                필수 {sum.blockingPassed}/{sum.blockingTotal} · 권고 {sum.softPassed}/{sum.softTotal}
              </span>
            </p>
            {(sum.failing.length > 0 || sum.missing.length > 0) && (
              <ul className="mt-2 space-y-1">
                {sum.failing.map((c) => (
                  <li key={c.id} className="flex gap-1.5 text-[12px] leading-relaxed">
                    <Icon name="close" size={12} className="mt-[3px] shrink-0 text-bad" />
                    <span>
                      <b className="font-semibold text-fg">{labels[c.id]?.label ?? c.id}</b> <span className="text-fg-3">— {c.message}</span>
                    </span>
                  </li>
                ))}
                {sum.missing.map((cid) => (
                  <li key={cid} className="flex gap-1.5 text-[12px] leading-relaxed">
                    <Icon name="dot" size={12} strokeWidth={4} className="mt-[3px] shrink-0 text-warn" />
                    <span>
                      <b className="font-semibold text-fg">{labels[cid].label}</b> <span className="text-fg-3">— 아직 실행하지 않음</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-2 text-[12px] text-fg-3">아직 체크를 실행하지 않았습니다. 발행할 때 서버가 다시 검사합니다.</p>
        )}
      </section>

      {/* outcome */}
      {published ? (
        <section className="rounded-xl border border-good/40 bg-good/[0.06] p-3.5" role="status">
          <p className="flex items-center gap-2 text-[14px] font-bold text-good">
            <Icon name="check" size={16} strokeWidth={2.4} /> 발행됨
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-2">기사는 공개 사이트와 피드에 반영되었습니다. 이후 수정·정정은 ‘발행 기사’에서 합니다.</p>
          {articleSlug && (
            <a href={`/a/${articleSlug}`} target="_blank" rel="noreferrer" className={cx(btn.base, btn.ghost, "mt-3")}>
              기사 보기 <span className="font-mono text-[11.5px] font-normal text-fg-3">/a/{articleSlug}</span> <Icon name="arrowUpRight" size={12} />
            </a>
          )}
        </section>
      ) : status === "rejected" ? (
        <section className="rounded-xl border border-bad/40 bg-bad/[0.05] p-3.5">
          <p className="text-[13px] font-semibold text-bad">반려된 후보</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">반려된 후보는 발행·예약할 수 없습니다. 다시 다루려면 ‘작성중’으로 되살리세요.</p>
          <button type="button" onClick={restore} disabled={working} className={cx(btn.base, btn.ghost, "mt-3")}>
            {busy === "restore" && spin} 작성중으로 되살리기
          </button>
        </section>
      ) : (
        <>
          <section className="space-y-2.5">
            <button ref={publishRef} type="button" onClick={() => publish()} disabled={working} className={cx(btn.base, btn.primary, "h-10 w-full text-[14px]")}>
              {publishing.busy === "publish" ? spin : <Icon name="bolt" size={14} />}
              지금 발행
            </button>
            <p className="text-[11.5px] leading-relaxed text-fg-4">발행 직전에 자동 저장을 마치고, 서버가 체크를 다시 실행합니다. 필수 체크를 통과하지 못하면 멈춥니다.</p>

            {publishing.blocked && (
              <div role="alert" className="space-y-2.5 rounded-xl border border-bad/40 bg-bad/[0.05] p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-bad">
                  <Icon name="alert" size={14} /> 필수 체크 미통과로 발행이 멈췄습니다
                </p>
                <ul className="space-y-1">
                  {sum.failing.map((c) => (
                    <li key={c.id} className="text-[12px] leading-relaxed text-fg-2">
                      <b className="font-semibold text-fg">{labels[c.id]?.label ?? c.id}</b> — {c.message}
                    </li>
                  ))}
                </ul>
                <label htmlFor={`${id}-override`} className={cx(f.label, "mt-1")}>
                  넘기는 사유 (기록·공개 감사 대상)
                  <span className="tabular font-mono text-[10.5px] font-normal text-fg-4">{reason.trim().length}/300</span>
                </label>
                <textarea
                  id={`${id}-override`}
                  rows={3}
                  maxLength={300}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="예: 공시 원문을 직접 대조했고, 출처 링크는 발행 후 10분 내 보강"
                  className={f.textarea}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => publish(reason.trim())} disabled={working || reason.trim().length < 5} className={cx(btn.base, btn.danger)}>
                    {publishing.busy === "override" && spin} 사유를 남기고 발행
                  </button>
                  <button type="button" onClick={publishing.dismissBlocked} className={cx(btn.base, btn.quiet)}>
                    취소
                  </button>
                </div>
                <p className="text-[11px] text-fg-4">사유는 5자 이상. 체크 결과에 ‘넘김 · {editorName}’으로 남습니다.</p>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-line-2 bg-bg-1 p-3.5" aria-labelledby={`${id}-sched`}>
            <h3 id={`${id}-sched`} className="kicker text-fg-3">
              예약 발행
            </h3>
            {status === "scheduled" && scheduledAt ? (
              <div className="mt-2 space-y-2.5">
                <p className="flex items-center gap-2 text-[13px] text-fg">
                  <Icon name="clock" size={14} className="text-ice" />
                  <span className="tabular font-semibold">
                    {dateKST(scheduledAt)} {clockKST(scheduledAt)}
                  </span>
                  <span className="text-[11.5px] text-fg-3">KST 발행 예정</span>
                </p>
                <p className="text-[11.5px] leading-relaxed text-fg-4">예약한 편집자가 책임 편집자로 기록됩니다. 본문을 고치면 예약이 풀리고 ‘검토’로 돌아갑니다.</p>
                <button type="button" onClick={unschedule} disabled={working} className={cx(btn.base, btn.ghost)}>
                  {busy === "unschedule" && spin} 예약 취소
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <label htmlFor={`${id}-at`} className="sr-only">
                  예약 시각 (한국 시간)
                </label>
                <div className="flex gap-2">
                  <input
                    ref={scheduleRef}
                    id={`${id}-at`}
                    type="datetime-local"
                    value={atValue}
                    min={minValue}
                    onChange={(e) => setAt(e.target.value)}
                    className={cx(f.input, "tabular min-w-0 flex-1 font-mono text-[12.5px] [color-scheme:inherit]")}
                  />
                  <button type="button" onClick={schedule} disabled={working || !atValue} className={cx(btn.base, btn.ghost, "h-9 shrink-0")}>
                    {busy === "schedule" ? spin : <Icon name="clock" size={13} />} 예약
                  </button>
                </div>
                <p className="text-[11.5px] text-fg-4">한국 시간(KST, UTC+9) 기준. 예약 시점에 필수 체크를 통과해야 합니다.</p>
              </div>
            )}
          </section>

          <section className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-3">
            <div>
              <h3 className="text-[13px] font-semibold text-fg">반려</h3>
              <p className="text-[11.5px] text-fg-3">사유는 활동 로그와 보드 카드에 남습니다.</p>
            </div>
            <button type="button" onClick={onReject} disabled={working} className={cx(btn.base, btn.danger, "shrink-0")}>
              반려…
            </button>
          </section>
        </>
      )}

      {notice && (
        <p role="status" className="flex items-center gap-1.5 text-[12.5px] font-medium text-good">
          <Icon name="check" size={13} /> {notice}
        </p>
      )}
      {(error ?? publishing.error) && (
        <p role="alert" className="text-[12.5px] text-bad">
          {error ?? publishing.error}
        </p>
      )}
    </div>
  );
}
