import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/ui";
import { ActivityBody, ActivitySkeleton } from "@/components/admin/dashboard/ActivityLog";

export const metadata: Metadata = { title: "활동 로그" };

/** Audit trail of every newsroom decision, filterable by kind (?kind=publish). */
export default function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  return (
    <>
      <PageHeader
        kicker="AUDIT · ACTIVITY LOG"
        title="활동 로그"
        description="수집·승격·발행·정정까지 편집국의 모든 결정이 누가, 언제 했는지와 함께 남습니다. 시각은 KST."
      />
      <Suspense fallback={<ActivitySkeleton />}>
        <ActivityBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}
