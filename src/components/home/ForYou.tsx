"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useReadHistory } from "@/lib/client/reading";
import { personalRank } from "@/lib/recommend";
import { beatDotClass } from "@/components/ui/BeatChip";
import { IntentLink } from "@/components/feed/IntentLink";
import { QueueScope } from "@/components/feed/QueueScope";
import type { MiniCard } from "@/components/feed/types";

const noop = () => () => {};

/**
 * "For You" ranked on this device from local reading history (beat/tag
 * affinity weighted by dwell). Nothing about the reader leaves the browser.
 */
export function ForYou({ pool }: { pool: MiniCard[] }) {
  const history = useReadHistory();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const personal = mounted && Object.keys(history).length >= 2;

  const picks = useMemo(() => {
    const rankable = pool.map((c) => ({ ...c, slug: c.s, beat: c.b, tags: c.tg, publishedAt: c.p, views: c.v }));
    if (!mounted) return [...rankable].sort((a, b) => b.views - a.views).slice(0, 6);
    // Recency is measured from the newest article in the pool, which keeps render pure.
    const now = Math.max(...rankable.map((c) => Date.parse(c.publishedAt)));
    return personalRank(rankable, history, now, 6);
  }, [pool, history, mounted]);

  return (
    <section aria-labelledby="foryou-h">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="foryou-h" className="kicker text-fg-3">
          {personal ? "당신이 읽은 흐름에서" : "지금 많이 읽는"}
        </h2>
        <span className="text-[11px] text-fg-4">기기 안에서만 계산</span>
      </div>
      <QueueScope ctx="home:foryou" label="추천" items={picks.map((c) => ({ s: c.s, t: c.t, b: c.b, r: c.r }))}>
        <ol className="space-y-px">
          {picks.map((c, i) => (
            <li key={c.s} className="relative">
              <IntentLink href={`/a/${c.s}`} className="group flex min-h-[64px] items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-bg-2">
                <span className="font-pixel tabular w-5 pt-[1px] text-[15px] text-fg-4">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className={`size-1.5 shrink-0 rounded-full ${beatDotClass(c.b)}`} aria-hidden="true" />
                    <span className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-fg group-hover:text-ice-2">{c.t}</span>
                  </span>
                </span>
              </IntentLink>
            </li>
          ))}
        </ol>
      </QueueScope>
    </section>
  );
}
