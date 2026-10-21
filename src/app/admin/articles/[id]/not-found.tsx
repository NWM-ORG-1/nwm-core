import Link from "next/link";
import { btn, cx, EmptyState } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";

export default function ArticleNotFound() {
  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="panel mx-auto max-w-xl">
        <EmptyState title="기사를 찾을 수 없습니다">
          <p>주소가 잘못되었거나 삭제된 기사입니다. 비공개 기사도 목록의 ‘비공개’ 탭에서 찾을 수 있습니다.</p>
          <Link href="/admin/articles" className={cx(btn.base, btn.ghost, "mt-4")}>
            <Icon name="arrowLeft" size={14} /> 발행 기사 목록
          </Link>
        </EmptyState>
      </div>
    </div>
  );
}
