import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSourceForEdit } from "@/data/admin";
import { getSourceFormOptions } from "@/data/admin-feeds";
import { btn, cx, PageHeader } from "@/components/admin/ui";
import { FormSkeleton } from "@/components/admin/feeds/bits";
import { NewSourceAside } from "@/components/admin/feeds/SourceAside";
import { SourceForm } from "@/components/admin/feeds/SourceForm";
import { toSourceFormValues } from "@/components/admin/feeds/source-values";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "소스 추가" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function NewSourcePage({ searchParams }: PageProps<"/admin/sources/new">) {
  return (
    <>
      <PageHeader
        kicker="SOURCES · NEW"
        title="소스 추가"
        description="새 정보 피드를 등록합니다. 2단계 수집기가 연결되기 전까지는 수동 소스로 동작합니다."
        actions={
          <Link href="/admin/sources" className={cx(btn.base, btn.ghost)}>
            <Icon name="arrowLeft" size={14} /> 소스 목록
          </Link>
        }
      />
      <Suspense fallback={<FormSkeleton />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const exp = typeof sp.experiment === "string" && UUID.test(sp.experiment) ? sp.experiment : undefined;
  const [{ experiments }, options] = await Promise.all([getSourceForEdit(null), getSourceFormOptions()]);
  const initial = toSourceFormValues(null, { experimentId: experiments.some((e) => e.id === exp) ? exp : undefined });
  return (
    <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 max-w-4xl">
        <SourceForm initial={initial} experiments={experiments} adapters={options.adapters} takenSlugs={options.slugs} catalog={options.catalog} envPresent={options.envPresent} />
      </div>
      <aside className="order-first xl:order-none">
        <div className="xl:sticky xl:top-5">
          <NewSourceAside />
        </div>
      </aside>
    </div>
  );
}
