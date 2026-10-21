"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useTransition, type FormEvent } from "react";
import type { Beat } from "@/db/schema";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";
import { articlesHref, type ArticleFilterValues } from "./labels";

const control =
  "h-8 w-full rounded-lg border border-line-2 bg-bg-1 px-2.5 text-[12.5px] text-fg transition-colors hover:border-line-3 focus:border-ice focus:outline-none focus-visible:outline-none focus:shadow-[0_0_0_3px_var(--ice-glow)]";

/**
 * GET filter form — the URL holds the state. Selects apply on change, the
 * search box on Enter. Without JS it degrades to a plain GET form.
 */
export function ArticleFilters({ values }: { values: ArticleFilterValues }) {
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const submit = () => formRef.current?.requestSubmit();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
    const href = articlesHref({
      status: values.status,
      beat: get("beat") as Beat | undefined,
      flag: get("flag") as ArticleFilterValues["flag"],
      q: get("q"),
    });
    start(() => router.replace(href, { scroll: false }));
  }

  const active = Boolean(values.beat || values.q || values.flag);

  return (
    <form
      key={JSON.stringify(values)}
      ref={formRef}
      action="/admin/articles"
      onSubmit={onSubmit}
      aria-busy={pending}
      role="search"
      aria-label="발행 기사 필터"
      className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_170px_auto] lg:grid-cols-[minmax(220px,360px)_150px_190px_auto]"
    >
      {values.status && <input type="hidden" name="status" value={values.status} />}
      <div className="relative col-span-2 sm:col-span-1">
        <label htmlFor={`${uid}-q`} className="sr-only">
          제목 검색
        </label>
        <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
        <input
          id={`${uid}-q`}
          type="search"
          name="q"
          defaultValue={values.q ?? ""}
          placeholder="제목 검색"
          enterKeyHint="search"
          maxLength={80}
          className={cx(control, "pl-8")}
        />
      </div>
      <div>
        <label htmlFor={`${uid}-beat`} className="sr-only">
          비트
        </label>
        <select id={`${uid}-beat`} name="beat" defaultValue={values.beat ?? ""} onChange={submit} className={control}>
          <option value="">모든 비트</option>
          {BEAT_ORDER.map((b) => (
            <option key={b} value={b}>
              {BEATS[b].label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-flag`} className="sr-only">
          정정 상태
        </label>
        <select id={`${uid}-flag`} name="flag" defaultValue={values.flag ?? ""} onChange={submit} className={control}>
          <option value="">정정 상태 전체</option>
          <option value="requests">미처리 정정 요청 있음</option>
          <option value="corrected">정정 이력 있음</option>
        </select>
      </div>
      <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
        <button type="submit" className={cx(btn.base, btn.ghost, "flex-1 sm:flex-none")}>
          {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
          적용
        </button>
        {active && (
          <Link href={articlesHref({ status: values.status })} replace scroll={false} className={cx(btn.base, btn.quiet, "px-2")}>
            초기화
          </Link>
        )}
      </div>
    </form>
  );
}
