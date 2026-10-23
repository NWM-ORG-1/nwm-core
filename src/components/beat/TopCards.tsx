import type { ArticleCard } from "@/data/dto";
import { readTimeLabel } from "@/lib/content/blocks";
import { AI_DISCLOSURE, AI_LABEL } from "@/lib/labels";
import { BeatChip } from "@/components/ui/BeatChip";
import { CoverArt } from "@/components/ui/CoverArt";
import { LocalTime } from "@/components/ui/LocalTime";
import { IntentLink } from "@/components/feed/IntentLink";
import { QueueScope } from "@/components/feed/QueueScope";

/** Lead cards with procedural cover art (no image bytes). */
export function TopCards({ items, ctx, label }: { items: ArticleCard[]; ctx: string; label: string }) {
  if (!items.length) return null;
  const [lead, ...rest] = items;
  return (
    <QueueScope ctx={ctx} label={label} items={items.map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }))}>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="group relative overflow-hidden rounded-[20px] border border-line bg-bg-1 transition-colors hover:border-line-2">
          <div className="aspect-[16/7] overflow-hidden border-b border-line">
            <CoverArt seed={lead.slug} beat={lead.beat} className="h-full w-full transition-transform duration-700 group-hover:scale-[1.02]" />
          </div>
          <div className="p-5 sm:p-6">
            <div className="mb-2 flex items-center gap-2 text-[12px]">
              <BeatChip beat={lead.beat} />
              {lead.isBreaking && <span className="hud text-live">BREAKING</span>}
              {lead.storyTitle && <span className="truncate text-fg-3">스토리 · {lead.storyTitle}</span>}
            </div>
            <h2 className="text-[24px] font-extrabold leading-snug tracking-[-0.03em] text-fg sm:text-[28px]">
              <IntentLink href={`/a/${lead.slug}`} prefetch={true} transitionTypes={["open"]} className="after:absolute after:inset-0 group-hover:text-ice-2">
                {lead.title}
              </IntentLink>
            </h2>
            <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-fg-3">{lead.dek}</p>
            <p className="mt-3 flex items-center gap-2 text-[12px] text-fg-4">
              <LocalTime iso={lead.publishedAt} />
              <span aria-hidden="true">·</span>
              {readTimeLabel(lead.readSeconds)}
              {AI_DISCLOSURE && (
                <>
                  <span aria-hidden="true">·</span>
                  {AI_LABEL[lead.aiInvolvement].short}
                </>
              )}
            </p>
          </div>
        </article>
        <div className="grid gap-4">
          {rest.map((c) => (
            <article key={c.slug} className="group relative grid grid-cols-[1fr_120px] gap-4 overflow-hidden rounded-[18px] border border-line bg-bg-1 p-4 transition-colors hover:border-line-2 sm:grid-cols-[1fr_160px]">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2 text-[12px]">
                  <BeatChip beat={c.beat} />
                  {c.isBreaking && <span className="hud text-live">BREAKING</span>}
                </div>
                <h3 className="text-[17px] font-bold leading-snug tracking-[-0.02em] text-fg">
                  <IntentLink href={`/a/${c.slug}`} prefetch={true} transitionTypes={["open"]} className="after:absolute after:inset-0 group-hover:text-ice-2">
                    {c.title}
                  </IntentLink>
                </h3>
                <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-fg-3">{c.dek}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <CoverArt seed={c.slug} beat={c.beat} variant="square" className="h-full w-full" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </QueueScope>
  );
}
