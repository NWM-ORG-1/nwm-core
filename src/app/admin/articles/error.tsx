"use client";

import Link from "next/link";
import { useEffect } from "react";
import { btn, cx } from "@/components/admin/ui";
import { Icon } from "@/components/ui/Icon";

/** Load failure on the article screens (list or detail). The rest of the console keeps working. */
export default function ArticlesError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <div className="px-4 py-10 sm:px-6">
      <div role="alert" className="panel mx-auto max-w-xl px-6 py-10 text-center">
        <Icon name="alert" size={22} className="mx-auto text-bad" />
        <h1 className="mt-3 text-[16px] font-bold text-fg">기사 정보를 불러오지 못했습니다</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-3">
          일시적인 연결 문제일 수 있습니다. 다시 시도해도 같으면 오류 코드를 개발팀에 전달하세요. 저장된 기사와 버전은 영향을 받지 않습니다.
        </p>
        {digest && <p className="tabular mt-2 font-mono text-[11.5px] text-fg-4">오류 코드 {digest}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={() => retry()} className={cx(btn.base, btn.primary)}>
            다시 시도
          </button>
          <Link href="/admin" className={cx(btn.base, btn.ghost)}>
            대시보드로
          </Link>
        </div>
      </div>
    </div>
  );
}
