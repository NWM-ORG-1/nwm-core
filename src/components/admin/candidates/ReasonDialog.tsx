"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { btn, cx } from "@/components/admin/ui";
import { f } from "./shared";

export const REJECT_PRESETS = ["중복 기사", "1차 출처 확인 불가", "뉴스 가치 낮음", "사실관계 불명확", "라이선스 문제", "타이밍 지남"];

/**
 * Modal that collects a required reason (native <dialog>: focus trap, Esc, inert
 * background). Closes itself when its route is hidden by <Activity>.
 */
export function ReasonDialog({
  open,
  title,
  description,
  label = "사유",
  placeholder,
  presets = REJECT_PRESETS,
  confirmLabel,
  tone = "danger",
  pending = false,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  presets?: string[];
  confirmLabel: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const id = useId();

  // Sync on every commit, not only when `open` flips: a dialog closed natively
  // (Esc) while the parent still says open must come back, e.g. to show an error.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      inputRef.current?.focus();
    } else if (!open && d.open) d.close();
  });

  // Hidden routes keep their state: never come back to a dialog left open.
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) d.close();
    };
  }, []);

  const submit = () => {
    const r = reason.trim();
    if (!r || pending) return;
    onConfirm(r);
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      onCancel={(e) => {
        // Esc while the action is running would hide its result
        if (pending) e.preventDefault();
      }}
      onClose={() => {
        // closed by the parent (done) → start clean next time
        if (!open) return setReason("");
        // force-closed mid-action: keep the text, the dialog reopens if the action fails
        if (pending) return;
        setReason("");
        onCancel();
      }}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[var(--radius)] border border-line-2 bg-bg-1 p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-black/60 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="p-5"
      >
        <h2 id={`${id}-t`} className="text-[16px] font-bold tracking-[-0.01em]">
          {title}
        </h2>
        {description && (
          <p id={`${id}-d`} className="mt-1 text-[12.5px] leading-relaxed text-fg-3">
            {description}
          </p>
        )}
        {presets.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label="자주 쓰는 사유">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setReason(p);
                  inputRef.current?.focus();
                }}
                className={cx(
                  "h-7 rounded-md border px-2 text-[12px] transition-colors",
                  reason === p ? "border-ice/60 bg-ice/10 text-fg" : "border-line-2 text-fg-3 hover:border-line-3 hover:text-fg",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <label htmlFor={`${id}-r`} className={cx(f.label, "mt-4")}>
          {label}
          <span className="tabular font-mono text-[10.5px] font-normal text-fg-4">{reason.trim().length}/200</span>
        </label>
        <textarea
          ref={inputRef}
          id={`${id}-r`}
          value={reason}
          maxLength={200}
          rows={3}
          required
          placeholder={placeholder}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          className={f.textarea}
        />
        {error && (
          <p role="alert" className={f.error}>
            {error}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={() => ref.current?.close()} disabled={pending} className={cx(btn.base, btn.quiet)}>
            취소
          </button>
          <button type="submit" disabled={!reason.trim() || pending} className={cx(btn.base, tone === "danger" ? btn.danger : btn.primary)}>
            {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
