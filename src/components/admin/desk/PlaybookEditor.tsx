"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { btn, cx } from "@/components/admin/ui";
import { savePlaybook } from "@/server/actions/desk";

/** Edit the editorial guide as a new version; the desk uses the newest one from its next pass. */
export function PlaybookEditor({ body, version }: { body: string; version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(body);
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = text.trim() !== body.trim();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setText(body);
          setMsg(null);
          setOpen(true);
        }}
        className={cx(btn.base, btn.ghost)}
      >
        직접 고치기
      </button>
    );
  }

  return (
    <form
      className="w-full space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await savePlaybook({ body: text, notes });
          if (res?.ok) {
            setOpen(false);
            setNotes("");
            router.refresh();
          } else setMsg({ ok: false, text: res && !res.ok ? res.error : "저장하지 못했습니다." });
        });
      }}
    >
      <label htmlFor="playbook-body" className="sr-only">
        편집 지침 (v{version}을 고쳐 새 버전으로 저장)
      </label>
      <textarea
        id="playbook-body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(16, Math.max(8, text.split("\n").length + 1))}
        maxLength={3000}
        className="w-full rounded-lg border border-line-2 bg-bg-1 p-3 text-[13px] leading-relaxed text-fg"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="playbook-notes" className="sr-only">
          바꾼 이유
        </label>
        <input
          id="playbook-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="바꾼 이유 (선택)"
          className="h-8 min-w-0 flex-1 rounded-md border border-line-2 bg-bg-1 px-2 text-[13px] text-fg"
        />
        <button type="submit" disabled={!dirty || pending} className={cx(btn.base, btn.primary)}>
          {pending ? "저장 중…" : `v${version + 1}로 저장`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={cx(btn.base, btn.quiet)}>
          취소
        </button>
      </div>
      {msg && (
        <p role="alert" className="text-[12px] text-bad">
          {msg.text}
        </p>
      )}
    </form>
  );
}
