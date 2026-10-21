import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getBoard } from "@/data/admin";
import { btn, cx, EmptyState, PageHeader } from "@/components/admin/ui";
import { KanbanBoard } from "@/components/admin/candidates/KanbanBoard";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "후보 보드" };

export default function CandidatesPage() {
  return (
    <>
      <PageHeader
        kicker="PIPELINE · CANDIDATES"
        title="후보 보드"
        description={
          <>
            피드에서 승격된 <b className="font-semibold text-fg-2">A 피드 AI</b>, 데이터 템플릿의 <b className="font-semibold text-fg-2">B 데이터 자동</b>, 편집자 기획인{" "}
            <b className="font-semibold text-fg-2">C 아이디어</b> 후보를 단계별로 관리합니다. 발행과 예약은 편집기에서 체크를 통과한 뒤에 합니다.
          </>
        }
        actions={
          <>
            <Link href="/admin/feeds" className={cx(btn.base, btn.ghost)}>
              <Icon name="rss" size={14} /> 피드 인박스
            </Link>
            <Link href="/admin/candidates/new" className={cx(btn.base, btn.primary)}>
              <Icon name="plus" size={14} strokeWidth={2.2} /> 아이디어로 시작
            </Link>
          </>
        }
      />
      <Suspense fallback={<BoardSkeleton />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  const cards = await getBoard();
  if (cards.length === 0) {
    return (
      <div className="px-4 py-5 sm:px-6">
        <div className="panel">
          <EmptyState title="진행 중인 후보가 없습니다">
            <p>
              피드 인박스에서 항목을 승격하거나{" "}
              <Link href="/admin/candidates/new" className="text-fg-2 underline underline-offset-2">
                아이디어로 새 후보
              </Link>
              를 만들어 보세요.
            </p>
          </EmptyState>
        </div>
      </div>
    );
  }
  return (
    <div className="px-4 py-5 sm:px-6">
      <KanbanBoard cards={cards} />
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-4 px-4 py-5 sm:px-6" aria-busy="true" aria-label="후보 보드를 불러오는 중">
      <div className="flex gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton h-7 w-20 rounded-full" />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden xl:grid xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="w-[min(300px,82vw)] shrink-0 space-y-2 xl:w-auto">
            <div className="skeleton h-5 w-24" />
            <div className="space-y-2 rounded-[var(--radius)] border border-line p-2">
              {Array.from({ length: 3 - (i % 2) }, (_, j) => (
                <div key={j} className="skeleton h-[132px] rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
