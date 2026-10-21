import Link from "next/link";
import { btn, cx, EmptyState } from "@/components/admin/ui";

export default function CandidateNotFound() {
  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="panel mx-auto max-w-xl">
        <EmptyState title="후보를 찾을 수 없습니다">
          <p>주소가 잘못되었거나 삭제된 후보입니다. 발행된 기사는 ‘발행 기사’에서 찾을 수 있습니다.</p>
          <p className="mt-4 flex justify-center gap-2">
            <Link href="/admin/candidates" className={cx(btn.base, btn.ghost)}>
              후보 보드
            </Link>
            <Link href="/admin/articles" className={cx(btn.base, btn.quiet)}>
              발행 기사
            </Link>
          </p>
        </EmptyState>
      </div>
    </div>
  );
}
