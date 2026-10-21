import type { ArticleCard } from "@/data/dto";
import { BeatChip } from "@/components/ui/BeatChip";
import { IntentLink } from "@/components/feed/IntentLink";
import { QueueScope } from "@/components/feed/QueueScope";

/** 지금 알아야 할 5가지 — the next five clusters after the lead. */
export function FiveThings({ items }: { items: Array<{ lead: ArticleCard; updates: number }> }) {
  return (
    <section aria-labelledby="five-h" className="panel flex h-full flex-col p-5">
      <h2 id="five-h" className="kicker mb-4 text-fg-3">
        지금 알아야 할 {items.length}가지
      </h2>
      <QueueScope ctx="home:five" label="지금 알아야 할 것" items={items.map(({ lead: c }) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }))} className="flex-1">
        <ol className="flex h-full flex-col justify-between gap-1">
          {items.map(({ lead, updates }, i) => (
            <li key={lead.slug} className="group relative flex gap-4 border-b border-line pb-3.5 pt-1 last:border-0 last:pb-0">
              <span className="font-pixel tabular w-7 shrink-0 pt-0.5 text-[20px] leading-none text-ice/70">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <BeatChip beat={lead.beat} />
                  {updates > 1 && <span className="text-[11px] text-fg-4">업데이트 {updates}건</span>}
                </div>
                <h3 className="text-[15.5px] font-bold leading-snug tracking-[-0.015em] text-fg">
                  <IntentLink href={`/a/${lead.slug}`} prefetch={true} transitionTypes={["open"]} className="after:absolute after:inset-0 group-hover:text-ice-2">
                    {lead.title}
                  </IntentLink>
                </h3>
              </div>
            </li>
          ))}
        </ol>
      </QueueScope>
    </section>
  );
}
