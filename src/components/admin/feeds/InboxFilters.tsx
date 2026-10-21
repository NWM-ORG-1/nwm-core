"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useTransition, type FormEvent } from "react";
import type { Beat } from "@/db/schema";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";

const control =
  "h-8 w-full rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[12.5px] text-fg transition-colors hover:border-line-3 focus:border-ice focus:outline-none focus-visible:outline-none focus:shadow-[0_0_0_3px_var(--ice-glow)]";

export interface InboxFilterValues {
  status: string;
  source?: string;
  experiment?: string;
  beat?: Beat;
  minScore?: string;
  q?: string;
}

/**
 * GET filter form (state lives in the URL). Selects submit on change; the
 * search box submits on Enter. Without JS it is a plain GET form.
 */
export function InboxFilters({
  values,
  sources,
  experiments,
}: {
  values: InboxFilterValues;
  sources: Array<{ slug: string; name: string }>;
  experiments: Array<{ code: string; name: string }>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const submit = () => formRef.current?.requestSubmit();

  // Client-side navigation with a clean query string (empty fields dropped).
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(e.currentTarget)) {
      const s = String(v).trim();
      if (s && !(k === "status" && s === "new")) p.set(k, s);
    }
    const qs = p.toString();
    start(() => router.replace(qs ? `/admin/feeds?${qs}` : "/admin/feeds", { scroll: false }));
  }
  const active = Boolean(values.source || values.experiment || values.beat || values.minScore || values.q);
  // Remount when the URL-backed values change so uncontrolled fields follow navigation.
  const key = JSON.stringify(values);

  return (
    <form
      key={key}
      ref={formRef}
      action="/admin/feeds"
      onSubmit={onSubmit}
      aria-busy={pending}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[minmax(200px,1.6fr)_repeat(4,minmax(0,1fr))_auto]"
      role="search"
      aria-label="피드 항목 필터"
    >
      <input type="hidden" name="status" value={values.status} />
      <label className="col-span-2 sm:col-span-3 lg:col-span-1">
        <span className="sr-only">키워드 검색</span>
        <span className="relative block">
          <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
          <input
            type="search"
            name="q"
            defaultValue={values.q ?? ""}
            placeholder="제목·요약 검색"
            enterKeyHint="search"
            className={cx(control, "pl-8")}
          />
        </span>
      </label>
      <label>
        <span className="sr-only">소스</span>
        <select name="source" defaultValue={values.source ?? ""} onChange={submit} className={control}>
          <option value="">모든 소스</option>
          {sources.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">가설</span>
        <select name="experiment" defaultValue={values.experiment ?? ""} onChange={submit} className={control}>
          <option value="">모든 가설</option>
          {experiments.map((e) => (
            <option key={e.code} value={e.code}>
              {e.code} · {e.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">비트</span>
        <select name="beat" defaultValue={values.beat ?? ""} onChange={submit} className={control}>
          <option value="">모든 비트</option>
          {BEAT_ORDER.map((b) => (
            <option key={b} value={b}>
              {BEATS[b].label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">최소 점수</span>
        <select name="minScore" defaultValue={values.minScore ?? ""} onChange={submit} className={control}>
          <option value="">점수 전체</option>
          {[40, 50, 60, 70, 80].map((n) => (
            <option key={n} value={n}>
              {n}점 이상
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
        <button type="submit" className={cx(btn.base, btn.ghost, "flex-1 lg:flex-none")}>
          {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
          적용
        </button>
        {active && (
          <Link
            href={values.status === "new" ? "/admin/feeds" : `/admin/feeds?status=${values.status}`}
            replace
            scroll={false}
            className={cx(btn.base, btn.quiet, "px-2")}
          >
            초기화
          </Link>
        )}
      </div>
    </form>
  );
}
