import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getExperimentForEdit } from "@/data/admin-feeds";
import { btn, cx, PageHeader } from "@/components/admin/ui";
import { FormSkeleton } from "@/components/admin/feeds/bits";
import { ExperimentAside } from "@/components/admin/feeds/ExperimentAside";
import { ExperimentForm } from "@/components/admin/feeds/ExperimentForm";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "가설 추가" };

export default function NewExperimentPage() {
  return (
    <>
      <PageHeader
        kicker="EXPERIMENTS · NEW"
        title="가설 추가"
        description="새 실험을 등록합니다. 소스를 연결하는 순간부터 수집 → 승격 → 후보 → 발행 퍼널이 이 가설 기준으로 집계됩니다."
        actions={
          <Link href="/admin/experiments" className={cx(btn.base, btn.ghost)}>
            <Icon name="arrowLeft" size={14} /> 실험 목록
          </Link>
        }
      />
      <Suspense fallback={<FormSkeleton />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const data = await getExperimentForEdit(null);
  if (!data) notFound();
  return (
    <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 max-w-4xl">
        <ExperimentForm
          initial={{
            id: null,
            code: data.suggested.code,
            name: "",
            hypothesis: "",
            primaryMetric: "publish_rate",
            status: "running",
            colorSlot: data.suggested.colorSlot,
            notes: "",
          }}
          others={data.others}
        />
      </div>
      <aside>
        <div className="xl:sticky xl:top-5">
          <ExperimentAside experiment={null} sources={[]} />
        </div>
      </aside>
    </div>
  );
}
