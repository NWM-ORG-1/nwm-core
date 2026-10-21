"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { CheckId, CheckResult } from "@/db/schema";
import { confirmLegal, runCandidateChecks } from "@/server/actions/candidates";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { clockSecKST, f, type CheckLabels } from "./shared";

/**
 * Summary against every known check, not only the stored ones: a blocking check
 * that has never run counts as missing, so a partial run never reads "발행 가능".
 */
export function checkSummary(checks: CheckResult[], labels: CheckLabels) {
  const ids = Object.keys(labels) as CheckId[];
  const byId = new Map(checks.map((c) => [c.id, c]));
  const pass = (c: CheckResult | undefined) => Boolean(c && (c.ok || c.overridden));
  const blockingIds = ids.filter((i) => labels[i].blocking);
  const softIds = ids.filter((i) => !labels[i].blocking);
  const failing = checks.filter((c) => labels[c.id]?.blocking !== false && c.blocking && !pass(c));
  const missing = blockingIds.filter((i) => !byId.has(i));
  return {
    ran: checks.length > 0,
    total: ids.length,
    passed: ids.filter((i) => pass(byId.get(i))).length,
    blockingTotal: blockingIds.length,
    blockingPassed: blockingIds.filter((i) => pass(byId.get(i))).length,
    softTotal: softIds.length,
    softPassed: softIds.filter((i) => pass(byId.get(i))).length,
    failing,
    /** blocking checks that have never run */
    missing,
    ready: checks.length > 0 && failing.length === 0 && missing.length === 0,
  };
}

type State = "ok" | "fail" | "warn" | "overridden" | "none";

function stateOf(c: CheckResult | undefined): State {
  if (!c) return "none";
  if (c.ok) return "ok";
  if (c.overridden) return "overridden";
  return c.blocking ? "fail" : "warn";
}

export function CheckRow({ id, c, label, blocking, children }: { id: CheckId; c?: CheckResult; label: string; blocking: boolean; children?: React.ReactNode }) {
  const s = stateOf(c);
  return (
    <li className="flex gap-2.5 py-2.5" data-check={id}>
      <span
        className={cx(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
          s === "ok" && "border-good/40 bg-good/10 text-good",
          s === "fail" && "border-bad/50 bg-bad/10 text-bad",
          (s === "warn" || s === "overridden") && "border-warn/50 bg-warn/10 text-warn",
          s === "none" && "border-line-2 text-fg-4",
        )}
        aria-hidden="true"
      >
        <Icon name={s === "ok" ? "check" : s === "fail" ? "close" : s === "none" ? "dot" : "alert"} size={11} strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[13px] font-semibold text-fg">{label}</span>
          <span className={cx("kicker !text-[10.5px]", blocking ? "text-fg-3" : "text-fg-4")}>{blocking ? "필수" : "권고"}</span>
          <span className="sr-only">
            — {s === "ok" ? "통과" : s === "fail" ? "미통과" : s === "warn" ? "주의" : s === "overridden" ? "사유를 남기고 넘김" : "실행 전"}
          </span>
        </p>
        <p className={cx("mt-0.5 text-[12px] leading-relaxed", s === "fail" ? "text-bad" : s === "warn" ? "text-warn" : "text-fg-3")}>{c ? c.message : "아직 실행하지 않았습니다"}</p>
        {c?.overridden && (
          <p className="mt-1 rounded-md bg-warn/[0.07] px-2 py-1 text-[11.5px] leading-relaxed text-fg-2">
            <b className="font-semibold text-warn">넘김</b> · {c.overridden.by} · {c.overridden.reason}
          </p>
        )}
        {children}
      </div>
    </li>
  );
}

export function ChecklistPanel({
  candidateId,
  checks,
  labels,
  readOnly,
  dirty,
  flush,
  onChecks,
}: {
  candidateId: string;
  checks: CheckResult[];
  labels: CheckLabels;
  readOnly: boolean;
  dirty: boolean;
  flush: () => Promise<boolean>;
  onChecks: (c: CheckResult[]) => void;
}) {
  const [pending, start] = useTransition();
  const [legalPending, startLegal] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);
  const byId = new Map(checks.map((c) => [c.id, c]));
  const sum = checkSummary(checks, labels);
  const legal = byId.get("legal");
  const [legalOn, setLegalOn] = useOptimistic(Boolean(legal?.ok));

  const run = () =>
    start(async () => {
      setError(null);
      const saved = await flush();
      const res = await runCandidateChecks({ id: candidateId });
      if (res?.ok && res.data) {
        onChecks(res.data.checks);
        setRanAt(new Date().toISOString());
        if (!saved) setError("저장하지 못한 변경이 있어, 마지막으로 저장된 초안 기준 결과입니다.");
      } else setError(res && !res.ok ? res.error : "체크를 실행하지 못했습니다.");
    });

  const setLegal = (confirmed: boolean) =>
    startLegal(async () => {
      setError(null);
      setLegalOn(confirmed);
      const res = await confirmLegal({ id: candidateId, confirmed });
      if (res?.ok && res.data) onChecks(res.data.checks);
      else setError(res && !res.ok ? res.error : "법률 검토 상태를 바꾸지 못했습니다.");
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {sum.ran ? (
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold",
              sum.failing.length ? "border-bad/40 bg-bad/[0.07] text-bad" : sum.missing.length ? "border-warn/40 bg-warn/[0.07] text-warn" : "border-good/40 bg-good/[0.07] text-good",
            )}
          >
            <Icon name={sum.ready ? "check" : "alert"} size={12} />
            {sum.failing.length ? `발행 불가 · 필수 ${sum.failing.length}건` : sum.missing.length ? `필수 ${sum.missing.length}건 미실행` : "발행 가능"}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-line-2 px-2.5 py-1 text-[12px] text-fg-3">체크 전</span>
        )}
        {sum.ran && (
          <span className="tabular font-mono text-[11.5px] text-fg-3">
            필수 {sum.blockingPassed}/{sum.blockingTotal} · 권고 {sum.softPassed}/{sum.softTotal}
          </span>
        )}
        {!readOnly && (
          <button type="button" onClick={run} disabled={pending} className={cx(btn.base, btn.ghost, "ml-auto h-7 px-2.5 text-[12px]")}>
            {pending ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : <Icon name="check" size={12} />}
            {sum.ran ? "다시 실행" : "체크 실행"}
          </button>
        )}
      </div>
      <p className="text-[11.5px] leading-relaxed text-fg-4">
        저장된 초안 기준으로 검사합니다{dirty ? " — 실행하면 먼저 저장합니다" : ""}.{ranAt ? ` 마지막 실행 ${clockSecKST(ranAt)}.` : ""}
      </p>
      {error && (
        <p role="alert" className="text-[12px] text-bad">
          {error}
        </p>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line-2 bg-bg-1 px-3" aria-busy={pending || undefined}>
        {(Object.keys(labels) as CheckId[]).map((id) => (
          <CheckRow key={id} id={id} c={byId.get(id)} label={labels[id].label} blocking={labels[id].blocking}>
            {id === "legal" && !readOnly && (
              <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-line-2 px-2.5 py-2 hover:border-line-3">
                <input
                  type="checkbox"
                  checked={legalOn}
                  disabled={legalPending}
                  onChange={(e) => setLegal(e.target.checked)}
                  className={cx(f.check, "mt-0.5")}
                />
                <span className="text-[12px] leading-relaxed text-fg-2">
                  명예훼손·저작권·개인정보 침해 소지를 직접 확인했습니다.
                  <span className="block text-[11px] text-fg-4">확인한 편집자 이름이 기록됩니다. 이후 초안을 고치면 확인이 풀리니 마지막에 체크하세요.</span>
                </span>
                {legalPending && <span className="ml-auto mt-1 size-3 shrink-0 animate-spin rounded-full border-2 border-ice border-t-transparent" aria-label="저장 중" />}
              </label>
            )}
          </CheckRow>
        ))}
      </ul>
    </div>
  );
}
