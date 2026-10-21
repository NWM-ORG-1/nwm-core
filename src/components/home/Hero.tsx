import type { ArticleFull } from "@/data/dto";
import { readTimeLabel } from "@/lib/content/blocks";
import { dateTimeKST } from "@/lib/format";
import { AiBadge } from "@/components/ui/AiBadge";
import { BeatChip } from "@/components/ui/BeatChip";
import { CoverArt } from "@/components/ui/CoverArt";
import { OrbitBackdrop } from "@/components/ui/OrbitBackdrop";
import { RichText } from "@/components/article/RichText";
import { IntentLink } from "@/components/feed/IntentLink";
import { LocalTime } from "@/components/ui/LocalTime";

/** TOP SIGNAL — the lead story, rendered big with its "왜 중요한가". */
export function Hero({ article, updates }: { article: ArticleFull; updates: number }) {
  const why = article.blocks.find((b) => b.type === "why");
  const chart = article.blocks.find((b) => b.type === "chart");
  return (
    <article className="scanlines relative overflow-hidden rounded-[22px] border border-line bg-bg-1">
      <OrbitBackdrop className="absolute inset-0 h-full w-full opacity-90" />
      <div className="bg-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.25fr_0.75fr] lg:p-10">
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="hud inline-flex items-center gap-2 text-ice">
              <span className="size-1.5 animate-pulse-dot rounded-full bg-live" aria-hidden="true" />
              TOP SIGNAL
            </span>
            <BeatChip beat={article.beat} link />
            {article.isBreaking && <span className="hud text-live">BREAKING</span>}
            {updates > 1 && article.storySlug && (
              <IntentLink href={`/s/${article.storySlug}`} className="text-[12px] text-fg-3 hover:text-fg">
                스토리 · 업데이트 {updates}건 →
              </IntentLink>
            )}
          </div>
          <h1 className="text-ice text-[30px] font-extrabold leading-[1.18] tracking-[-0.035em] sm:text-[40px] lg:text-[46px]">
            <IntentLink href={`/a/${article.slug}`} prefetch={true} transitionTypes={["open"]} className="hover:opacity-90">
              {article.title}
            </IntentLink>
          </h1>
          <p className="mt-4 max-w-[38em] text-[17px] leading-relaxed text-fg-2 sm:text-[18px]">{article.dek}</p>
          {why && why.type === "why" && (
            <div className="mt-6 max-w-[40em]">
              <p className="kicker mb-2 text-fg-3">왜 중요한가</p>
              <ul className="space-y-1.5 text-[15px] leading-relaxed text-fg-2">
                {why.items.slice(0, 2).map((t, i) => (
                  <li key={i} className="relative pl-4">
                    <span className="absolute left-0 top-[0.7em] size-1.5 -translate-y-1/2 rounded-full bg-ice/70" aria-hidden="true" />
                    <RichText text={t} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-3 text-[12.5px] text-fg-3">
            <span title={dateTimeKST(article.publishedAt)}>
              <LocalTime iso={article.publishedAt} />
            </span>
            <span aria-hidden="true">·</span>
            <span>{readTimeLabel(article.readSeconds)} 읽기</span>
            <AiBadge value={article.aiInvolvement} editorName={article.editor?.name} variant="long" />
          </div>
        </div>
        <div className="relative hidden lg:block">
          <div className="brackets h-full min-h-[260px] overflow-hidden rounded-2xl border border-line">
            <CoverArt seed={article.slug} beat={article.beat} points={chart?.type === "chart" ? chart.points : undefined} variant="square" className="h-full w-full" />
          </div>
        </div>
      </div>
    </article>
  );
}
