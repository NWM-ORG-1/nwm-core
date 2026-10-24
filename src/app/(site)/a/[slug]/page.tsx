import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition } from "react";
import { getArticle, getPrerenderSlugs, getRelated, getStoryTimeline } from "@/data/public";
import type { ArticleFull } from "@/data/dto";
import { BEATS } from "@/lib/beats";
import { AI_DISCLOSURE, aiLabelLong, IPTC_SOURCE_TYPE } from "@/lib/labels";
import { SITE } from "@/lib/site";
import { LOGO_URL, ORG_ID } from "@/components/site/OrgJsonLd";
import type { Queue } from "@/lib/client/reading";
import { ArticleView, RelatedList, StoryTimeline } from "@/components/article/ArticleView";
import { NextUp, QueueRail, ReaderDock, ReaderShell } from "@/components/article/ArticleReader";

/** Latest 200 are prerendered at build; newer slugs render once on first request, then serve static. */
export async function generateStaticParams() {
  const slugs = await getPrerenderSlugs(200);
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "000000-sample" }];
}

export async function generateMetadata({ params }: PageProps<"/a/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) return { title: "기사를 찾을 수 없습니다", robots: { index: false } };
  return {
    title: a.title,
    description: a.dek,
    alternates: { canonical: `/a/${a.slug}` },
    openGraph: {
      type: "article",
      title: a.title,
      description: a.dek,
      url: `/a/${a.slug}`,
      publishedTime: a.publishedAt,
      modifiedTime: a.updatedAt,
      section: BEATS[a.beat].label,
      tags: a.tags,
      images: [{ url: `/a/${a.slug}/image`, width: 1200, height: 675, alt: a.title }],
    },
    twitter: { card: "summary_large_image", images: [`/a/${a.slug}/image`] },
    other: AI_DISCLOSURE
      ? {
          "nwm:ai-involvement": a.aiInvolvement,
          "nwm:ai-label": aiLabelLong(a.aiInvolvement, a.editor?.name ?? a.author?.name),
        }
      : undefined,
  };
}

function jsonLd(a: ArticleFull) {
  const data = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.title,
    description: a.dek,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    articleSection: BEATS[a.beat].label,
    keywords: a.tags.join(", "),
    inLanguage: "ko-KR",
    mainEntityOfPage: `${SITE.url}/a/${a.slug}`,
    // 1200×675, drawn by ./image/route.tsx
    image: [`${SITE.url}/a/${a.slug}/image`],
    // with AI disclosure off, only reporter-written pieces name a person as author
    author:
      a.author && (AI_DISCLOSURE || a.aiInvolvement === "human")
        ? { "@type": "Person", name: a.author.name, url: `${SITE.url}/editors/${a.author.slug}` }
        : { "@type": "Organization", name: AI_DISCLOSURE ? a.byline : SITE.name },
    editor: a.editor ? { "@type": "Person", name: a.editor.name, url: `${SITE.url}/editors/${a.editor.slug}` } : undefined,
    publisher: { "@type": "NewsMediaOrganization", "@id": ORG_ID, name: SITE.name, alternateName: SITE.short, url: SITE.url, logo: { "@type": "ImageObject", url: LOGO_URL, width: 512, height: 512 } },
    // machine-readable AI provenance (IPTC digital source type)
    digitalSourceType: AI_DISCLOSURE ? IPTC_SOURCE_TYPE[a.aiInvolvement] : undefined,
    correction: a.corrections.map((c) => ({ "@type": "CorrectionComment", text: c.note, datePublished: c.publishedAt })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default function ArticlePage({ params }: PageProps<"/a/[slug]">) {
  return (
    <Suspense fallback={<ArticleSkeleton />}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: Pick<PageProps<"/a/[slug]">, "params">) {
  const { slug } = await params;
  const a = await getArticle(slug);
  if (!a) notFound();
  const [related, timeline] = await Promise.all([getRelated(slug, 8), a.storyId ? getStoryTimeline(a.storyId) : Promise.resolve([])]);

  // Direct-visit queue: this article, then its story, then related.
  const seen = new Set<string>([a.slug]);
  const fallback: Queue = {
    ctx: `related:${a.slug}`,
    label: "관련 기사",
    items: [
      { s: a.slug, t: a.title, b: a.beat, r: a.readSeconds },
      ...timeline.filter((t) => !seen.has(t.slug) && seen.add(t.slug)).map((t) => ({ s: t.slug, t: t.title, b: a.beat })),
      ...related.filter((c) => !seen.has(c.slug) && seen.add(c.slug)).map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds })),
    ],
  };

  // Only the article slides; the fixed progress bar and dock stay outside so they keep their own
  // view-transition names and don't move with the content.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(a) }} />
      <ViewTransition
        key={a.slug}
        enter={{ next: "next", prev: "prev", open: "open", default: "none" }}
        exit={{ next: "next", prev: "prev", open: "open", default: "none" }}
        default="none"
      >
        <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_minmax(0,280px)] xl:gap-14">
            <aside className="hidden lg:block" aria-label="맥락">
              <div className="sticky top-[calc(var(--header-h)+var(--ticker-h)+24px)] space-y-8">
                {a.story && <StoryTimeline slug={a.slug} storySlug={a.story.slug} title={a.story.title} items={timeline} />}
                <div className="text-[12.5px] leading-relaxed text-fg-4">
                  <p className="kicker mb-2 text-fg-3">{BEATS[a.beat].label}</p>
                  {BEATS[a.beat].blurb}
                </div>
              </div>
            </aside>

            <div className="mx-auto w-full min-w-0 max-w-[40rem]">
              <ReaderShell slug={a.slug} beat={a.beat} tags={a.tags} readSeconds={a.readSeconds} fallback={fallback}>
                <ArticleView a={a} />
              </ReaderShell>
              <div className="mt-12">
                <NextUp slug={a.slug} fallback={fallback} />
              </div>
              {a.story && timeline.length > 1 && (
                <div className="mt-12 lg:hidden">
                  <StoryTimeline slug={a.slug} storySlug={a.story.slug} title={a.story.title} items={timeline} />
                </div>
              )}
              <div className="mt-14">
                <RelatedList items={related.slice(0, 6)} />
              </div>
            </div>

            <aside className="hidden lg:block" aria-label="읽기 큐">
              <div className="sticky top-[calc(var(--header-h)+var(--ticker-h)+24px)]">
                <QueueRail slug={a.slug} fallback={fallback} />
              </div>
            </aside>
          </div>
        </main>
      </ViewTransition>
      <div className="read-progress" aria-hidden="true" />
      <ReaderDock slug={a.slug} fallback={fallback} />
    </>
  );
}

function ArticleSkeleton() {
  return (
    <main className="mx-auto max-w-[40rem] px-4 pt-12" aria-busy="true" aria-label="기사를 불러오는 중">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-5 h-10 w-full" />
      <div className="skeleton mt-3 h-10 w-4/5" />
      <div className="skeleton mt-8 h-20 w-full" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-4 w-full" />
        ))}
      </div>
    </main>
  );
}
