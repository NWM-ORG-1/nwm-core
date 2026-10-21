import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/ui";
import { DashboardBody, DashboardSkeleton } from "@/components/admin/dashboard/Dashboard";
import { RefreshButton } from "@/components/admin/dashboard/DashboardClient";

export const metadata: Metadata = { title: "대시보드" };

/** Newsroom overview: throughput, AI labelling, hypotheses and what needs attention now. */
export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader
        kicker="NEWSROOM · OVERVIEW"
        title="대시보드"
        description="정보 피드에서 발행까지 — 지난 24시간의 처리량, 7일간의 가설별 성과, 지금 처리해야 할 경보."
        actions={<RefreshButton />}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody />
      </Suspense>
    </>
  );
}
