"use client";

import { startTransition, useOptimistic, useState, useTransition } from "react";
import { cx } from "@/components/admin/ui";
import { setSourceStatus } from "@/server/actions/sources";

type Status = "active" | "paused" | "error";

const LABEL: Record<Status, string> = { active: "수집중", paused: "일시정지", error: "오류" };

/**
 * Collection on/off switch. Active ⇄ paused; an errored source shows as off and
 * switching it on retries (clears the last error).
 */
export function SourceStatusToggle({ id, name, status }: { id: string; name: string; status: Status }) {
  const [optimistic, setOptimistic] = useOptimistic<Status>(status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const on = optimistic === "active";

  function flip() {
    const next = on ? "paused" : "active";
    setError(null);
    start(async () => {
      setOptimistic(next);
      const res = await setSourceStatus({ id, status: next });
      if (!res?.ok) startTransition(() => setError(res?.error ?? "변경하지 못했습니다."));
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${name} 수집`}
          title={on ? "수집 일시정지" : optimistic === "error" ? "다시 시도 (수집 재개)" : "수집 재개"}
          onClick={flip}
          disabled={pending}
          className={cx(
            "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60",
            on ? "border-good/50 bg-good/25" : optimistic === "error" ? "border-bad/50 bg-bad/15" : "border-line-3 bg-bg-3",
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              "absolute top-1/2 size-3 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200",
              on ? "left-[16px] bg-good" : optimistic === "error" ? "left-[2px] bg-bad" : "left-[2px] bg-fg-3",
            )}
          />
        </button>
        <span
          className={cx(
            "text-[12px] font-semibold",
            optimistic === "active" ? "text-good" : optimistic === "error" ? "text-bad" : "text-fg-3",
          )}
        >
          {LABEL[optimistic]}
        </span>
        {optimistic === "error" && !pending && <span className="text-[11px] text-fg-3">· 켜면 재시도</span>}
      </span>
      {error && (
        <span role="alert" className="text-[11.5px] text-bad">
          {error}
        </span>
      )}
    </span>
  );
}
