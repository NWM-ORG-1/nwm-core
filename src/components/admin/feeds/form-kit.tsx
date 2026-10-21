"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/admin/ui";
import type { ActionState } from "@/server/actions/result";
import { field } from "./bits";

/** Field-level issues from a zod failure returned by `fail()` ("path: message · path: message"). */
export function issuesFrom(state: ActionState<unknown>): Record<string, string> {
  if (!state || state.ok || state.code !== "invalid") return {};
  const out: Record<string, string> = {};
  for (const part of state.error.split(" · ")) {
    const i = part.indexOf(": ");
    if (i > 0) out[part.slice(0, i)] = koMessage(part.slice(i + 2));
  }
  return out;
}

/** Zod's default messages are English; the newsroom reads Korean. */
export function koMessage(msg: string): string {
  if (/[가-힣]/.test(msg)) return msg;
  if (/^Too small/i.test(msg)) return "값이 너무 짧거나 작습니다";
  if (/^Too big/i.test(msg)) return "값이 너무 길거나 큽니다";
  if (/expected number/i.test(msg)) return "숫자를 입력하세요";
  if (/^Invalid (UUID|input)/i.test(msg)) return "형식이 올바르지 않습니다";
  if (/^Invalid option/i.test(msg)) return "허용되지 않는 값입니다";
  if (/pattern/i.test(msg)) return "형식이 올바르지 않습니다";
  return msg;
}

/** Labelled form row. `htmlFor` ties the label to its control. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <label htmlFor={htmlFor} className={cx(field.label, "mb-1.5 flex items-center gap-1")}>
        {label}
        {required && (
          <span className="text-bad" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} role="alert" className="mt-1 text-[12px] font-medium text-bad">
          {error}
        </p>
      ) : help ? (
        <p id={htmlFor ? `${htmlFor}-help` : undefined} className={field.help}>
          {help}
        </p>
      ) : null}
    </div>
  );
}

/** A titled group of fields with an explanatory lead. */
export function FormSection({ title, kicker, lead, children }: { title: string; kicker?: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel p-5">
      <header className="mb-4">
        {kicker && <p className="hud mb-1.5 text-fg-4">{kicker}</p>}
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-fg">{title}</h2>
        {lead && <div className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-fg-3">{lead}</div>}
      </header>
      {children}
    </section>
  );
}

export function ErrorSummary({ state, labels }: { state: ActionState<unknown>; labels: Record<string, string> }) {
  if (!state || state.ok) return null;
  const issues = issuesFrom(state);
  const keys = Object.keys(issues);
  return (
    <div role="alert" className="rounded-xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[13px] text-fg-2">
      <p className="font-semibold text-bad">{keys.length ? "입력값을 확인하세요" : "저장하지 못했습니다"}</p>
      {keys.length ? (
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[12.5px]">
          {keys.map((k) => (
            <li key={k}>
              <span className="font-semibold text-fg">{labels[k] ?? k}</span> — {issues[k]}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12.5px]">{state.error}</p>
      )}
    </div>
  );
}
