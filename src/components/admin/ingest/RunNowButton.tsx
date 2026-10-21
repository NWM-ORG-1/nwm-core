"use client";

import { useState, useTransition } from "react";
import { btn, cx } from "@/components/admin/ui";
import { runSourceNow } from "@/server/actions/ingest";

/** Asks the worker to collect this source on its next tick. */
export function RunNowButton({ id, compact = false }: { id: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await runSourceNow({ id });
            setMsg(res?.ok ? { ok: true, text: res.message ?? "요청했습니다." } : { ok: false, text: res && !res.ok ? res.error : "요청하지 못했습니다." });
          })
        }
        className={cx(btn.base, compact ? btn.quiet : btn.ghost, compact && "h-7 px-2 text-[12px]")}
      >
        {pending ? "요청 중…" : "지금 수집"}
      </button>
      {msg && (
        <span role={msg.ok ? "status" : "alert"} className={cx("text-[11.5px]", msg.ok ? "text-fg-3" : "text-bad")}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
