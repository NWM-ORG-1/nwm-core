"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SearchRecord } from "@/data/dto";
import { BEATS } from "@/lib/beats";
import { dateKST } from "@/lib/format";
import { searchIndex } from "@/lib/search";
import { beatDotClass } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { IntentLink } from "@/components/feed/IntentLink";
import { QueueScope } from "@/components/feed/QueueScope";

/** Full-page search (static page; the query lives in ?q= and is read on the client). */
export function SearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [index, setIndex] = useState<SearchRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/search-index")
      .then((r) => (r.ok ? r.json() : []))
      .then((r) => alive && setIndex(r))
      .catch(() => alive && setIndex([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const url = q.trim() ? `${pathname}?q=${encodeURIComponent(q.trim())}` : pathname;
      router.replace(url, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
  }, [q, pathname, router]);

  const hits = useMemo(() => (index ? searchIndex(index, q, 50) : []), [index, q]);

  return (
    <div className="mt-6">
      <label className="flex h-14 items-center gap-3 rounded-2xl border border-line-2 bg-bg-1 px-4 focus-within:border-ice/60">
        <Icon name="search" size={18} className="text-fg-3" />
        <span className="sr-only">검색어</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="기사·키워드 (초성 검색 지원)"
          className="h-full flex-1 bg-transparent text-[17px] text-fg outline-none placeholder:text-fg-4"
        />
      </label>
      <p className="mt-3 text-[12.5px] text-fg-4">{!index ? "색인을 불러오는 중…" : q.trim() ? `${hits.length}건` : "최근 기사 1,000건을 검색합니다."}</p>
      <QueueScope ctx={`search:${q}`} label={`검색 · ${q}`} items={hits.map((h) => ({ s: h.slug, t: h.title, b: h.beat }))}>
        <ul className="mt-4 divide-y divide-line">
          {hits.map((h) => (
            <li key={h.slug} className="group relative py-4">
              <p className="flex items-center gap-2 text-[12px] text-fg-3">
                <span className={`size-1.5 rounded-full ${beatDotClass(h.beat)}`} aria-hidden="true" />
                {BEATS[h.beat].label} · {dateKST(new Date(h.publishedAt).toISOString())}
              </p>
              <IntentLink href={`/a/${h.slug}`} transitionTypes={["open"]} className="mt-1 block text-[17px] font-bold leading-snug text-fg after:absolute after:inset-0 group-hover:text-ice-2">
                {h.title}
              </IntentLink>
              <p className="mt-1 text-[14px] text-fg-3">{h.dek}</p>
            </li>
          ))}
        </ul>
      </QueueScope>
    </div>
  );
}
