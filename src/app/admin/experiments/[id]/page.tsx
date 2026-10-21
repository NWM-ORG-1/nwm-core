import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getExperimentForEdit } from "@/data/admin-feeds";
import { Badge, btn, cx, PageHeader } from "@/components/admin/ui";
import { ExperimentChip, FormSkeleton } from "@/components/admin/feeds/bits";
import { ExperimentAside } from "@/components/admin/feeds/ExperimentAside";
import { ExperimentForm } from "@/components/admin/feeds/ExperimentForm";
import { EXPERIMENT_STATUS_LABEL, EXPERIMENT_STATUS_TONE, isExperimentStatus } from "@/components/admin/feeds/labels";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "가설 편집" };

export default function EditExperimentPage({ params }: PageProps<"/admin/experiments/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <div className="border-b border-line px-6 pb-5 pt-6">
            <div className="skeleton mb-3 h-3 w-28" />
            <div className="skeleton h-7 w-72" />
          </div>
          <FormSkeleton />
        </>
      }
    >
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getExperimentForEdit(id);
  if (!data || !data.experiment) notFound();
  const e = data.experiment;
  const status = isExperimentStatus(e.status) ? e.status : "running";

  return (
    <>
      <PageHeader
        kicker={`EXPERIMENTS · ${e.code}`}
        title={e.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ExperimentChip code={e.code} colorSlot={e.colorSlot} />
            <Badge tone={EXPERIMENT_STATUS_TONE[status]}>{EXPERIMENT_STATUS_LABEL[status]}</Badge>
            <span>연결된 소스 {data.sources.length}개</span>
          </span>
        }
        actions={
          <Link href="/admin/experiments" className={cx(btn.base, btn.ghost)}>
            <Icon name="arrowLeft" size={14} /> 실험 목록
          </Link>
        }
      />
      <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 max-w-4xl">
          <ExperimentForm
            key={JSON.stringify(e)}
            initial={{
              id: e.id,
              code: e.code,
              name: e.name,
              hypothesis: e.hypothesis,
              primaryMetric: e.primaryMetric,
              status: e.status,
              colorSlot: e.colorSlot,
              notes: e.notes,
            }}
            others={data.others}
          />
        </div>
        <aside>
          <div className="xl:sticky xl:top-5">
            <ExperimentAside experiment={e} sources={data.sources} />
          </div>
        </aside>
      </div>
    </>
  );
}
