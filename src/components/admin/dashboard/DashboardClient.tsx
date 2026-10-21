"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { Beat } from "@/db/schema";
import { BeatChip } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { createDataAuto } from "@/server/actions/candidates";
import type { ActionState } from "@/server/actions/result";
import { btn, cx } from "../ui";

/** Re-runs the dashboard's server reads in place. */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => router.refresh())}
      disabled={pending}
      className={cx(btn.base, btn.ghost)}
      aria-label="대시보드 새로고침"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={pending ? "animate-spin" : undefined}
      >
        <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
      </svg>
      새로고침
    </button>
  );
}

/**
 * Horizontal scroller that brings its `[aria-current="page"]` child into view
 * (filter tabs on narrow screens). Re-runs when `activeKey` changes.
 */
export function ScrollActiveIntoView({ children, className, activeKey }: { children: ReactNode; className?: string; activeKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    const b = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (r.left >= b.left + 16 && r.right <= b.right - 32) return;
    box.scrollTo({ left: Math.max(0, box.scrollLeft + (r.left - b.left) - (b.width - r.width) / 2) });
  }, [activeKey]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export interface DataTemplateOption {
  id: string;
  label: string;
  description: string;
  beat: Beat;
}

/** Mode (b): one click builds a data article from a code template, then opens it in the editor. */
export function DataAutoPanel({ templates }: { templates: DataTemplateOption[] }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [state, setState] = useState<ActionState<{ id: string }>>(null);
  const [, start] = useTransition();

  // The dashboard stays mounted (hidden) after we navigate to the new candidate;
  // clear the spinner and the message so returning shows a fresh panel.
  useLayoutEffect(() => {
    return () => {
      setRunning(null);
      setState(null);
    };
  }, []);

  const run = (id: string) => {
    setRunning(id);
    setState(null);
    start(async () => {
      let res: ActionState<{ id: string }>;
      try {
        res = await createDataAuto({ template: id });
      } catch {
        res = { ok: false, error: "서버에 연결하지 못했습니다. 네트워크를 확인한 뒤 다시 시도하세요.", at: Date.now() };
      }
      startTransition(() => {
        setState(res);
        if (res?.ok && res.data) router.push(`/admin/candidates/${res.data.id}`);
        else setRunning(null);
      });
    });
  };

  return (
    <div className="space-y-2">
      {templates.map((t) => {
        const busy = running === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => run(t.id)}
            disabled={running != null}
            aria-busy={busy || undefined}
            className="group flex w-full items-center gap-3 rounded-xl border border-line-2 bg-bg-1/40 px-3.5 py-3 text-left transition-colors hover:border-line-3 hover:bg-bg-2 disabled:cursor-wait disabled:opacity-60"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13.5px] font-semibold text-fg">{t.label}</span>
                <BeatChip beat={t.beat} />
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-fg-3">{t.description}</span>
            </span>
            <span className="sr-only">— 후보 만들고 편집기 열기</span>
            {busy ? (
              <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-fg-3 border-t-transparent" aria-hidden="true" />
            ) : (
              <Icon name="arrowRight" size={15} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
            )}
          </button>
        );
      })}
      <p aria-live="polite" className="min-h-[1.25rem] text-[12px]">
        {running && !state && <span className="text-fg-3">템플릿으로 기사를 작성하는 중…</span>}
        {state && !state.ok && <span role="alert" className="text-bad">{state.error}</span>}
        {state?.ok && <span className="text-good">{state.message} 편집기로 이동합니다.</span>}
      </p>
    </div>
  );
}
