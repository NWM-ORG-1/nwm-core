import Link from "next/link";
import type { ArticleCard, StoryDTO } from "@/data/dto";
import type { Beat } from "@/db/schema";
import { BEATS, NAV_BEATS } from "@/lib/beats";
import { compactKo } from "@/lib/format";
import { beatDotClass, beatTextClass } from "@/components/ui/BeatChip";
import { IntentLink } from "@/components/feed/IntentLink";
import { QueueScope } from "@/components/feed/QueueScope";

export function SectionHead({ title, href, more = "더 보기" }: { title: string; href?: string; more?: string }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
      <h2 className="text-[19px] font-bold tracking-[-0.02em] text-fg">{title}</h2>
      {href && (
        <Link href={href} className="text-[12.5px] font-semibold text-fg-3 hover:text-ice">
          {more} →
        </Link>
      )}
    </div>
  );
}

/** One desktop column per beat on offer. */
const RAIL_COLS = NAV_BEATS.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5";

/** Per-beat columns; horizontal scroll-snap on mobile. */
export function BeatRails({ rails }: { rails: Record<Beat, ArticleCard[]> }) {
  return (
    <section aria-label="분야별 최신">
      <div className={`no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid ${RAIL_COLS} lg:overflow-visible`}>
        {NAV_BEATS.map((b) => (
          <QueueScope
            key={b}
            ctx={`home:rail:${b}`}
            label={BEATS[b].label}
            items={rails[b].map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }))}
            className="w-[78vw] max-w-[320px] shrink-0 snap-start lg:w-auto lg:max-w-none"
          >
            <div className="panel h-full p-4">
              <Link href={BEATS[b].path} className={`mb-3 flex items-center justify-between text-[13px] font-bold ${beatTextClass(b)}`}>
                <span className="inline-flex items-center gap-2">
                  <span className={`size-2 rounded-full ${beatDotClass(b)}`} aria-hidden="true" />
                  {BEATS[b].label}
                </span>
                <span className="hud text-fg-4">{BEATS[b].code} →</span>
              </Link>
              <ul className="space-y-3">
                {rails[b].map((c) => (
                  <li key={c.slug} className="group relative border-t border-line pt-3 first:border-0 first:pt-0">
                    <IntentLink href={`/a/${c.slug}`} transitionTypes={["open"]} className="text-[14px] font-semibold leading-snug text-fg after:absolute after:inset-0 group-hover:text-ice-2">
                      {c.title}
                    </IntentLink>
                  </li>
                ))}
              </ul>
            </div>
          </QueueScope>
        ))}
      </div>
    </section>
  );
}

export function StoryList({ stories }: { stories: StoryDTO[] }) {
  if (!stories.length) return null;
  return (
    <section aria-labelledby="stories-h">
      <h2 id="stories-h" className="kicker mb-3 text-fg-3">
        이어지는 이슈
      </h2>
      <ul className="space-y-2">
        {stories.map((s) => (
          <li key={s.id}>
            <IntentLink href={`/s/${s.slug}`} className="group flex items-start justify-between gap-3 rounded-xl border border-line px-3.5 py-3 hover:border-line-2 hover:bg-bg-2">
              <span className="min-w-0">
                <span className={`kicker !text-[11px] ${beatTextClass(s.beat)}`}>{BEATS[s.beat].label}</span>
                <span className="mt-1 block text-[14.5px] font-semibold leading-snug text-fg group-hover:text-ice-2">{s.title}</span>
              </span>
              <span className="tabular shrink-0 rounded-md bg-bg-3 px-2 py-0.5 font-mono text-[11px] text-fg-3">{s.articleCount}건</span>
            </IntentLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PopularList({ items }: { items: ArticleCard[] }) {
  return (
    <section aria-labelledby="popular-h">
      <h2 id="popular-h" className="kicker mb-3 text-fg-3">
        많이 읽은 기사
      </h2>
      <QueueScope ctx="home:popular" label="많이 읽은" items={items.map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }))}>
        <ol className="space-y-3">
          {items.map((c, i) => (
            <li key={c.slug} className="group relative flex gap-3">
              <span className="font-pixel tabular w-5 text-[15px] text-fg-4">{i + 1}</span>
              <div className="min-w-0">
                <IntentLink href={`/a/${c.slug}`} className="text-[14px] font-semibold leading-snug text-fg after:absolute after:inset-0 group-hover:text-ice-2">
                  {c.title}
                </IntentLink>
                <p className="mt-0.5 text-[11px] text-fg-4">조회 {compactKo(c.views)}</p>
              </div>
            </li>
          ))}
        </ol>
      </QueueScope>
    </section>
  );
}
