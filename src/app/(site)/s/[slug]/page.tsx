import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getStory, getStorySlugs } from "@/data/public";
import { BEATS } from "@/lib/beats";
import { readTimeLabel } from "@/lib/content/blocks";
import { clockKST, dateKST } from "@/lib/format";
import { AI_LABEL } from "@/lib/labels";
import { BeatChip } from "@/components/ui/BeatChip";
import { OrbitBackdrop } from "@/components/ui/OrbitBackdrop";
import { IntentLink } from "@/components/feed/IntentLink";
import { QueueScope } from "@/components/feed/QueueScope";

export async function generateStaticParams() {
  const slugs = await getStorySlugs();
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "sample-story" }];
}

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await getStory(slug);
  if (!s) return { title: "스토리를 찾을 수 없습니다", robots: { index: false } };
  return { title: `${s.story.title} — 스토리`, description: s.story.summary, alternates: { canonical: `/s/${slug}` } };
}

export default function StoryPage({ params }: PageProps<"/s/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 pt-16"><div className="skeleton h-12 w-2/3" /></div>}>
      <Story params={params} />
    </Suspense>
  );
}

async function Story({ params }: Pick<PageProps<"/s/[slug]">, "params">) {
  const { slug } = await params;
  const data = await getStory(slug);
  if (!data) notFound();
  const { story, articles } = data;
  const chronological = [...articles].reverse();
  const queueNewest = articles.map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }));
  const queueOldest = chronological.map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }));
  return (
    <main>
      <header className="relative overflow-hidden border-b border-line">
        <OrbitBackdrop className="absolute inset-0 h-full w-full opacity-70" />
        <div className="relative mx-auto max-w-3xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16">
          <div className="flex flex-wrap items-center gap-3">
            <p className="hud text-ice">STORY</p>
            <BeatChip beat={story.beat} link />
            <span className={`kicker rounded-full border px-2 py-0.5 ${story.status === "developing" ? "border-live/40 text-live" : "border-line-2 text-fg-3"}`}>
              {story.status === "developing" ? "진행 중" : "정리됨"}
            </span>
          </div>
          <h1 className="text-ice mt-4 text-[34px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[46px]">{story.title}</h1>
          {story.summary && <p className="mt-4 text-[17px] leading-relaxed text-fg-2">{story.summary}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-fg-3">업데이트 {articles.length}건</span>
            {chronological[0] && (
              <QueueScope ctx={`story:${story.slug}:chrono`} label={`스토리 · ${story.title} (처음부터)`} items={queueOldest}>
                <IntentLink href={`/a/${chronological[0].slug}`} prefetch={true} transitionTypes={["open"]} className="inline-flex h-9 items-center rounded-full bg-ice px-4 text-[13px] font-bold text-bg hover:bg-ice-2">
                  처음부터 이어 읽기
                </IntentLink>
              </QueueScope>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <QueueScope ctx={`story:${story.slug}`} label={`스토리 · ${story.title}`} items={queueNewest}>
          <ol className="relative border-l border-line-2 pl-6">
            {articles.map((c, i) => (
              <li key={c.slug} className="group relative pb-9 last:pb-0">
                <span className={`absolute -left-[31px] top-1.5 size-3 rounded-full border-2 border-bg ${i === 0 ? "bg-ice" : "bg-line-3"}`} aria-hidden="true" />
                <p className="tabular font-mono text-[12px] text-fg-3">
                  {dateKST(c.publishedAt)} {clockKST(c.publishedAt)}
                  {i === 0 && <span className="hud ml-2 text-ice">LATEST</span>}
                </p>
                <h2 className="mt-1.5 text-[20px] font-bold leading-snug tracking-[-0.02em] text-fg">
                  <IntentLink href={`/a/${c.slug}`} transitionTypes={["open"]} className="after:absolute after:inset-0 group-hover:text-ice-2">
                    {c.title}
                  </IntentLink>
                </h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-fg-3">{c.dek}</p>
                <p className="mt-2 text-[12px] text-fg-4">
                  {readTimeLabel(c.readSeconds)} · {AI_LABEL[c.aiInvolvement].short} · {BEATS[c.beat].label}
                </p>
              </li>
            ))}
          </ol>
        </QueueScope>
      </div>
    </main>
  );
}
