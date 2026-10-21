import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/ui";
import { StoriesBody, StoriesSkeleton } from "@/components/admin/dashboard/Stories";

export const metadata: Metadata = { title: "스토리" };

/** Running stories: list, create, and inline edit (title, summary, developing/settled). */
export default function StoriesPage() {
  return (
    <>
      <PageHeader
        kicker="STORIES"
        title="스토리"
        description="여러 기사를 하나의 흐름으로 묶는 연속 보도 단위입니다. 진행중 스토리는 공개 사이트의 스토리 레일과 /s/ 페이지에 노출됩니다."
      />
      <Suspense fallback={<StoriesSkeleton />}>
        <StoriesBody />
      </Suspense>
    </>
  );
}
