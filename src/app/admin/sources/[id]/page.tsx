import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSourceForEdit } from "@/data/admin";
import { getSourceActivity, getSourceFormOptions } from "@/data/admin-feeds";
import { btn, cx, LicenseIcons, PageHeader, TrustBadge } from "@/components/admin/ui";
import { FormSkeleton } from "@/components/admin/feeds/bits";
import { SourceActivityAside } from "@/components/admin/feeds/SourceAside";
import { SourceForm } from "@/components/admin/feeds/SourceForm";
import { toSourceFormValues } from "@/components/admin/feeds/source-values";
import { Icon } from "@/components/ui/Icon";
import { SOURCE_KIND_LABEL } from "@/lib/labels";

export const metadata: Metadata = { title: "소스 편집" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditSourcePage({ params }: PageProps<"/admin/sources/[id]">) {
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
  if (!UUID.test(id)) notFound();
  const [{ source, experiments }, activity, options] = await Promise.all([getSourceForEdit(id), getSourceActivity(id), getSourceFormOptions()]);
  if (!source || !activity) notFound();
  const initial = toSourceFormValues(source);

  return (
    <>
      <PageHeader
        kicker={`SOURCES · ${source.slug.toUpperCase()}`}
        title={source.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{SOURCE_KIND_LABEL[source.kind]}</span>
            <span className="font-mono text-[12px] text-fg-3">{source.adapter}</span>
            <TrustBadge tier={source.trustTier} />
            <LicenseIcons
              commercialOk={source.licCommercialOk}
              redistributionOk={source.licRedistributionOk}
              verbatimOk={source.licVerbatimOk}
              reviewed={source.licReviewedAt != null}
              signalOnly={source.signalOnly}
            />
          </span>
        }
        actions={
          <>
            <Link href={`/admin/feeds?status=all&source=${source.slug}`} className={cx(btn.base, btn.ghost)}>
              수집 항목
            </Link>
            <Link href="/admin/sources" className={cx(btn.base, btn.ghost)}>
              <Icon name="arrowLeft" size={14} /> 소스 목록
            </Link>
          </>
        }
      />
      <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 max-w-4xl">
          {/* Keyed by the saved values: a fresh server copy remounts the form with new defaults. */}
          <SourceForm
            key={JSON.stringify(initial)}
            initial={initial}
            experiments={experiments}
            adapters={options.adapters}
            takenSlugs={options.slugs}
          />
        </div>
        <aside>
          <div className="xl:sticky xl:top-5">
            <SourceActivityAside id={source.id} name={source.name} slug={source.slug} activity={activity} />
          </div>
        </aside>
      </div>
    </>
  );
}
