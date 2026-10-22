import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCandidateBundle } from "@/data/admin";
import { CHECK_META } from "@/server/checks";
import { aiStatus } from "@/server/generator/config";
import { CandidateEditor } from "@/components/admin/candidates/CandidateEditor";
import { SourcePanel } from "@/components/admin/candidates/SourcePanel";

export const metadata: Metadata = { title: "후보 편집" };

export default function CandidatePage({ params }: PageProps<"/admin/candidates/[id]">) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/candidates/[id]">, "params">) {
  const { id } = await params;
  const bundle = await getCandidateBundle(id);
  if (!bundle) notFound();
  return <CandidateEditor key={bundle.candidate.id} bundle={bundle} checkLabels={CHECK_META} aiStatus={aiStatus()} sources={<SourcePanel bundle={bundle} />} />;
}

function EditorSkeleton() {
  return (
    <div aria-busy="true" aria-label="편집기를 불러오는 중">
      <div className="flex items-center gap-3 border-b border-line px-6 py-3">
        <div className="skeleton h-6 w-24" />
        <div className="skeleton h-5 w-40" />
        <div className="ml-auto flex gap-2">
          <div className="skeleton h-8 w-20" />
          <div className="skeleton h-8 w-24" />
        </div>
      </div>
      <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[260px_minmax(0,1fr)_340px] 2xl:grid-cols-[300px_minmax(0,1fr)_380px]">
        <div className="hidden space-y-3 xl:block">
          <div className="skeleton h-28" />
          <div className="skeleton h-56" />
        </div>
        <div className="mx-auto w-full max-w-[760px] space-y-4">
          <div className="skeleton h-12" />
          <div className="skeleton h-20" />
          <div className="skeleton h-40" />
          <div className="skeleton h-40" />
        </div>
        <div className="skeleton h-[420px]" />
      </div>
    </div>
  );
}
