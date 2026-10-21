"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/server/actions/result";
import { btn, cx } from "./ui";

/** Shows the outcome of a server action (success / error). */
export function ActionMessage({ state, className = "" }: { state: ActionState<unknown>; className?: string }) {
  // A success message fades after a few seconds; a new result (a new object) shows again.
  const [dismissed, setDismissed] = useState<ActionState<unknown> | null>(null);
  useEffect(() => {
    if (!state?.ok) return;
    const t = setTimeout(() => setDismissed(state), 3500);
    return () => clearTimeout(t);
  }, [state]);
  if (!state || dismissed === state) return null;
  if (state.ok && !state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cx("text-[12.5px] font-medium", state.ok ? "text-good" : "text-bad", className)}>
      {state.ok ? state.message : state.error}
    </p>
  );
}

/**
 * Button that calls a server action with fixed arguments.
 * `confirm` asks first; `prompt` collects a required reason.
 */
export function ActionButton<T>({
  action,
  args,
  children,
  variant = "ghost",
  confirm,
  prompt,
  className = "",
  onDone,
  title,
}: {
  action: (args: never) => Promise<ActionState<T>>;
  args: Record<string, unknown>;
  children: ReactNode;
  variant?: keyof typeof btn;
  confirm?: string;
  prompt?: { message: string; key: string; placeholder?: string };
  className?: string;
  onDone?: (state: ActionState<T>) => void;
  title?: string;
}) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState<T>>(null);
  const router = useRouter();

  const run = () => {
    let extra: Record<string, unknown> = {};
    if (confirm && !window.confirm(confirm)) return;
    if (prompt) {
      const v = window.prompt(prompt.message, prompt.placeholder ?? "");
      if (v == null || !v.trim()) return;
      extra = { [prompt.key]: v.trim() };
    }
    start(async () => {
      const res = await action({ ...args, ...extra } as never);
      setState(res);
      onDone?.(res);
      if (res?.ok) router.refresh();
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={run} disabled={pending} title={title} className={cx(btn.base, btn[variant], className)}>
        {pending ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : null}
        {children}
      </button>
      {state && !state.ok && <span role="alert" className="text-[12px] text-bad">{state.error}</span>}
    </span>
  );
}
