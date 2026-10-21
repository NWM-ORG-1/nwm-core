import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCandidateBundle } from "@/data/admin";
import { BEATS } from "@/lib/beats";
import { clockKST, dateKST } from "@/lib/format";
import { Badge, StatusBadge } from "@/components/admin/ui";
import { ArticlePreview } from "@/components/admin/candidates/ArticlePreview";
import { aiInvolvementOf, bylineOf } from "@/components/admin/candidates/shared";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "기사 미리보기" };

export default function CandidatePreviewPage({ params }: PageProps<"/admin/candidates/[id]/preview">) {
  return (
    <Suspense fallback={<PreviewSkeleton />}>
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: Pick<PageProps<"/admin/candidates/[id]/preview">, "params">) {
  const { id } = await params;
  const bundle = await getCandidateBundle(id);
  if (!bundle) notFound();
  const c = bundle.candidate;
  const ai = aiInvolvementOf(c.mode, c.generator?.id ?? null);
  const story = c.storyId ? bundle.stories.find((s) => s.id === c.storyId) : null;
  const d = c.draft;

  return (
    <>
      <div className="sticky top-12 z-30 border-b border-line bg-bg/90 backdrop-blur-md lg:top-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href={`/admin/candidates/${c.id}`} className="inline-flex h-8 items-center gap-1.5 text-[13px] font-semibold text-fg-3 hover:text-fg">
            <Icon name="arrowLeft" size={14} /> 편집기로
          </Link>
          <span className="h-5 w-px bg-line-2" aria-hidden="true" />
          <Badge tone="warn">미리보기</Badge>
          <StatusBadge status={c.status} />
          <span className="text-[12px] text-fg-3">
            저장된 초안 기준 · <span className="tabular">{dateKST(c.updatedAt)} {clockKST(c.updatedAt)}</span> 저장
          </span>
          {c.article && c.status === "published" && (
            <a href={`/a/${c.article.slug}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-ice hover:underline">
              공개 기사 <Icon name="arrowUpRight" size={12} />
            </a>
          )}
        </div>
      </div>
      {/* same column as the public article page: max-w 40rem, px-4 on phones */}
      <div className="mx-auto max-w-[40rem] px-4 pb-24 pt-8 lg:pt-12">
        <ArticlePreview
          a={{
            title: d.title,
            dek: d.dek,
            blocks: d.blocks,
            sentiment: d.sentiment,
            beat: c.beat,
            isBreaking: d.isBreaking,
            storyTitle: story?.title ?? null,
            ai,
            editorName: bundle.me.name,
            byline: bylineOf(ai, BEATS[c.beat].label, bundle.me.name),
            tickers: d.tickers,
            tags: d.tags,
            sources: d.sources,
          }}
        />
      </div>
    </>
  );
}

function PreviewSkeleton() {
  return (
    <div className="mx-auto max-w-[40rem] px-4 pt-12" aria-busy="true" aria-label="미리보기를 불러오는 중">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-5 h-10 w-full" />
      <div className="skeleton mt-3 h-10 w-4/5" />
      <div className="skeleton mt-8 h-20 w-full" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-4 w-full" />
        ))}
      </div>
    </div>
  );
}
