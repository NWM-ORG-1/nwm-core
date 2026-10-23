"use client";

import { useState, useTransition } from "react";
import { btn, cx } from "@/components/admin/ui";
import { setIngestPaused, setSentimentPublic } from "@/server/actions/ingest";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string } | null>) =>
    start(async () => {
      const res = await fn();
      setMsg(res?.ok ? { ok: true, text: res.message ?? "반영했습니다." } : { ok: false, text: res?.error ?? "처리하지 못했습니다." });
    });
  return { pending, msg, run };
}

function Message({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <span role={msg.ok ? "status" : "alert"} className={cx("text-[12px]", msg.ok ? "text-fg-3" : "text-bad")}>
      {msg.text}
    </span>
  );
}

/** Emergency stop for all collection (the worker re-reads it within 30 s). */
export function IngestPauseButton({ paused }: { paused: boolean }) {
  const { pending, msg, run } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!paused && !window.confirm("모든 소스의 수집을 멈출까요? (시세·공시 포함)")) return;
          run(() => setIngestPaused({ paused: !paused }) as Promise<{ ok: boolean; message?: string; error?: string } | null>);
        }}
        className={cx(btn.base, paused ? btn.primary : btn.danger)}
      >
        {paused ? "수집 다시 시작" : "전체 수집 멈춤"}
      </button>
      <Message msg={msg} />
    </span>
  );
}

/** Ends (or restores) the shadow period of the sentiment index. */
export function SentimentPublishSwitch({ isPublic }: { isPublic: boolean }) {
  const { pending, msg, run } = useAction();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const q = isPublic
            ? "투자심리지수를 비공개(그림자 운영)로 돌릴까요? 사이트에서는 샘플이나 빈 화면이 보입니다."
            : "투자심리지수를 ‘베타’로 공개할까요? 최근 48시간의 계산값도 함께 공개됩니다.";
          if (!window.confirm(q)) return;
          run(() => setSentimentPublic({ public: !isPublic }) as Promise<{ ok: boolean; message?: string; error?: string } | null>);
        }}
        className={cx(btn.base, isPublic ? btn.ghost : btn.primary)}
      >
        {isPublic ? "비공개로 전환" : "베타 공개"}
      </button>
      <Message msg={msg} />
    </span>
  );
}
