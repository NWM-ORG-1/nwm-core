import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArticlePreview } from "@/components/admin/candidates/ArticlePreview";
import { previewArticle } from "@/components/admin/candidates/shared";
import { Badge, StatusBadge } from "@/components/admin/ui";
import { MiniAppGate, MiniAppReady } from "@/components/telegram/MiniApp";
import { Icon } from "@/components/ui/Icon";
import { getMiniAppPreview } from "@/data/telegram-preview";
import { clockKST, dateKST } from "@/lib/format";

export const metadata: Metadata = { title: "기사 미리보기", robots: { index: false, follow: false } };

/**
 * The newsroom bot's 미리보기 button opens this page inside Telegram (a Mini
 * App). It signs in with Telegram's launch data instead of the newsroom
 * password (/api/telegram/webapp) and shows the saved draft, read-only.
 */
export default function MiniAppPreviewPage({ params, searchParams }: PageProps<"/tg/preview/[id]">) {
  return (
    <Suspense fallback={<p className="px-5 pt-16 text-center text-[15px] text-fg-3">불러오는 중…</p>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: PageProps<"/tg/preview/[id]">) {
  const { id } = await params;
  const t = (await searchParams).t;
  const ticket = typeof t === "string" ? t : null;
  const view = await getMiniAppPreview(id, ticket);
  const adminHref = `/admin/candidates/${id}/preview`;

  if (view.state === "missing") notFound();
  if (view.state === "signin") return <MiniAppGate candidateId={id} adminHref={adminHref} />;
  if (view.state === "denied") {
    return (
      <div className="mx-auto max-w-[28rem] px-5 pt-16 text-center">
        <p className="text-[15px] leading-relaxed text-fg-2">이 텔레그램 계정은 뉴스룸 계정과 연결돼 있지 않습니다.</p>
        <a href={adminHref} className="mt-6 inline-block text-[13px] font-semibold text-ice hover:underline">
          뉴스룸에서 열기 (로그인)
        </a>
      </div>
    );
  }

  const c = view.candidate;
  return (
    <>
      <MiniAppReady />
      <div className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <Badge tone="warn">미리보기</Badge>
          <StatusBadge status={c.status} />
          <span className="text-[12px] text-fg-3">
            저장된 초안 · <span className="tabular">{dateKST(c.updatedAt)} {clockKST(c.updatedAt)}</span>
          </span>
          {c.article && c.status === "published" && (
            <a href={`/a/${c.article.slug}`} className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-ice hover:underline">
              공개 기사 <Icon name="arrowUpRight" size={12} />
            </a>
          )}
        </div>
      </div>
      <div className="mx-auto max-w-[40rem] px-4 pb-16 pt-6">
        <ArticlePreview a={previewArticle(c, c.storyTitle, view.viewer)} />
      </div>
    </>
  );
}
