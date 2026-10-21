"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { ActionButton, ActionMessage } from "@/components/admin/client";
import { Badge, btn, cx } from "@/components/admin/ui";
import { logCorrectionRequest, rejectCorrectionRequest } from "@/server/actions/articles";
import type { ActionState } from "@/server/actions/result";
import { CORRECTION_KIND_LABEL, REQUEST_CHANNEL_LABEL, REQUEST_STATUS_LABEL, dateTimeKST, requestClock, shortDateTime, shortDay, type CorrectionKind } from "./labels";
import { useRevise } from "./ReviseContext";

export interface RequestItem {
  id: string;
  receivedAt: string;
  requester: string;
  channel: string;
  claim: string;
  status: "open" | "accepted" | "rejected";
  resolvedAt: string | null;
  correctionId: string | null;
}

const input =
  "w-full rounded-lg border border-line-2 bg-bg-1 px-3 text-[13.5px] text-fg placeholder:text-fg-4 transition-colors hover:border-line-3 focus:border-ice focus:shadow-[0_0_0_3px_var(--ice-glow)] focus:outline-none focus-visible:outline-none aria-[invalid=true]:border-bad";

const REJECT_PREFIX = "정정 요청 기각: ";

/** 정정·반론 요청 (언론중재법) — list with deadlines, actions, and an intake form. */
export function CorrectionRequests({
  articleId,
  requests,
  corrections,
  log,
  now,
}: {
  articleId: string;
  requests: RequestItem[];
  corrections: Array<{ id: string; revision: number; kind: CorrectionKind }>;
  log: Record<string, { summary: string; at: string; actor: string }>;
  now: number;
}) {
  const { prefill, requestId, kind } = useRevise();
  // Linked only while the form is set to publish a correction notice.
  const linkedId = kind ? requestId : "";
  const open = requests.filter((r) => r.status === "open").sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  const closed = requests.filter((r) => r.status !== "open");
  const [showForm, setShowForm] = useState(false);
  const [intake, setIntake] = useState<ActionState>(null);

  return (
    <div className="space-y-4">
      {requests.length === 0 && !showForm && <p className="text-[13px] text-fg-3">이 기사에 접수된 정정·반론 요청이 없습니다.</p>}

      {open.length > 0 && (
        <ul className="space-y-2.5" aria-label="미처리 요청">
          {open.map((r) => {
            const c = requestClock(r.receivedAt, now);
            const replyLate = c.elapsedDays >= 3;
            return (
              <li
                key={r.id}
                className={cx(
                  "rounded-xl border px-3.5 py-3",
                  c.tone === "bad" ? "border-bad/40 bg-bad/[0.05]" : c.tone === "warn" ? "border-warn/35 bg-warn/[0.04]" : "border-line-2 bg-bg-1/60",
                  linkedId === r.id && "ring-1 ring-ice/50",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className="font-semibold text-fg">{r.requester}</span>
                    <span className="text-fg-3">{REQUEST_CHANNEL_LABEL[r.channel] ?? r.channel}</span>
                    <span className="text-fg-4" aria-hidden="true">
                      ·
                    </span>
                    <time dateTime={r.receivedAt} title={dateTimeKST(r.receivedAt)} className="tabular font-mono text-[12px] text-fg-3">
                      접수 {shortDateTime(r.receivedAt)}
                    </time>
                  </p>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={c.tone === "neutral" ? "warn" : c.tone}>{REQUEST_STATUS_LABEL.open}</Badge>
                    <Badge tone={c.tone === "neutral" ? "neutral" : c.tone} title="접수 후 경과일">
                      <span className="tabular">경과 {c.elapsedDays}일</span>
                    </Badge>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-2">{r.claim}</p>
                <dl className="tabular mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                  <div className="flex gap-1.5">
                    <dt className="text-fg-3">회신 기한</dt>
                    <dd className={replyLate ? "font-semibold text-warn" : "text-fg-2"}>
                      {shortDay(c.replyBy)}
                      {replyLate ? " · 지남" : ""}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-fg-3">게재 기한</dt>
                    <dd className={c.tone === "bad" ? "font-semibold text-bad" : "text-fg-2"}>
                      {shortDay(c.publishBy)} · {c.daysLeft > 0 ? `D-${c.daysLeft}` : c.daysLeft === 0 ? "D-day" : `${-c.daysLeft}일 초과`}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => prefill(r.id)} className={cx(btn.base, btn.primary, "h-8")}>
                    정정으로 처리
                  </button>
                  <ActionButton
                    action={rejectCorrectionRequest}
                    args={{ id: r.id }}
                    variant="ghost"
                    prompt={{ message: `‘${r.requester}’ 요청을 기각합니다.\n청구인에게 통지한 기각 사유를 적어 주세요 (내부 기록).`, key: "note" }}
                  >
                    기각
                  </ActionButton>
                  {linkedId === r.id && <span className="text-[12px] text-ice-2">수정·정정 양식에 연결됨</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {closed.length > 0 && (
        <div>
          <h3 className="kicker mb-1.5 text-fg-3">처리된 요청</h3>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {closed.map((r) => {
              const corr = r.correctionId ? corrections.find((c) => c.id === r.correctionId) : undefined;
              const entry = log[r.id];
              const rejectNote = r.status === "rejected" && entry?.summary.startsWith(REJECT_PREFIX) ? entry.summary.slice(REJECT_PREFIX.length) : null;
              return (
                <li key={r.id} className="px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                    <Badge tone={r.status === "accepted" ? "good" : "neutral"}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                    <span className="font-semibold text-fg-2">{r.requester}</span>
                    <span className="text-fg-3">{REQUEST_CHANNEL_LABEL[r.channel] ?? r.channel}</span>
                    <span className="tabular font-mono text-[11.5px] text-fg-3">
                      {shortDateTime(r.receivedAt)}
                      {r.resolvedAt ? ` → ${shortDateTime(r.resolvedAt)}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-fg-3" title={r.claim}>
                    {r.claim}
                  </p>
                  {corr && (
                    <p className="mt-1 text-[12px] text-fg-2">
                      → r{corr.revision} {CORRECTION_KIND_LABEL[corr.kind]} 게시로 처리
                    </p>
                  )}
                  {rejectNote && (
                    <p className="mt-1 text-[12px] text-fg-2">
                      기각 사유: {rejectNote} <span className="text-fg-4">· {entry!.actor}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showForm ? (
        <IntakeForm
          articleId={articleId}
          onClose={() => setShowForm(false)}
          onDone={(res) => {
            setIntake(res);
            setShowForm(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIntake(null);
              setShowForm(true);
            }}
            className={cx(btn.base, btn.ghost)}
          >
            ＋ 요청 접수 기록
          </button>
          <ActionMessage state={intake} />
        </div>
      )}
    </div>
  );
}

function IntakeForm({ articleId, onClose, onDone }: { articleId: string; onClose: () => void; onDone: (res: ActionState) => void }) {
  const uid = useId();
  const router = useRouter();
  const [requester, setRequester] = useState("");
  const [channel, setChannel] = useState("email");
  const [claim, setClaim] = useState("");
  const [tried, setTried] = useState(false);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();

  const errors = {
    requester: !requester.trim() ? "청구인을 입력하세요" : null,
    claim: claim.trim().length < 5 ? "청구 내용을 5자 이상 적으세요" : null,
  };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTried(true);
    if (errors.requester || errors.claim) return;
    start(async () => {
      const res = await logCorrectionRequest({ articleId, requester: requester.trim(), channel, claim: claim.trim() });
      setState(res);
      if (res?.ok) {
        router.refresh();
        onDone(res);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-xl border border-line-2 bg-bg-1/60 p-3.5" aria-labelledby={`${uid}-h`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${uid}-h`} className="kicker text-fg-2">
          새 요청 접수 기록
        </h3>
        <button type="button" onClick={onClose} className={cx(btn.base, btn.quiet, "h-7 px-2 text-[12px]")}>
          취소
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
        <div>
          <label htmlFor={`${uid}-who`} className="kicker mb-1.5 block text-fg-2">
            청구인 <span className="text-bad" aria-hidden="true">*</span>
          </label>
          <input
            id={`${uid}-who`}
            value={requester}
            onChange={(e) => setRequester(e.target.value)}
            maxLength={120}
            placeholder="예: ㈜한빛반도체 홍보팀 / 독자 김OO"
            aria-invalid={tried && !!errors.requester}
            className={cx(input, "h-9")}
            autoFocus
          />
          {tried && errors.requester && <p className="mt-1 text-[12px] font-medium text-bad">{errors.requester}</p>}
        </div>
        <div>
          <label htmlFor={`${uid}-ch`} className="kicker mb-1.5 block text-fg-2">
            접수 경로
          </label>
          <select id={`${uid}-ch`} value={channel} onChange={(e) => setChannel(e.target.value)} className={cx(input, "h-9 px-2.5")}>
            {Object.entries(REQUEST_CHANNEL_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${uid}-claim`} className="kicker mb-1.5 block text-fg-2">
          청구 내용 <span className="text-bad" aria-hidden="true">*</span>
        </label>
        <textarea
          id={`${uid}-claim`}
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="어느 부분이 사실과 다르다고 주장하는지, 요구하는 조치(정정·반론·추후보도)를 그대로 옮겨 적습니다."
          aria-invalid={tried && !!errors.claim}
          className={cx(input, "resize-y py-2 leading-relaxed")}
        />
        {tried && errors.claim && <p className="mt-1 text-[12px] font-medium text-bad">{errors.claim}</p>}
        <p className="mt-1 text-[12px] text-fg-3">접수 시각은 지금으로 기록되며, 이때부터 3일·7일 기한이 계산됩니다.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={cx(btn.base, btn.primary)}>
          {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
          접수 기록
        </button>
        <ActionMessage state={state} />
      </div>
    </form>
  );
}
