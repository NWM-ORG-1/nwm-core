import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getEditor, getEditorSlugs } from "@/data/public";
import { RiverClient } from "@/components/feed/RiverClient";
import { toMini } from "@/components/feed/types";

export async function generateStaticParams() {
  const slugs = await getEditorSlugs();
  return slugs.length ? slugs.map((slug) => ({ slug })) : [{ slug: "newsroom" }];
}

export async function generateMetadata({ params }: PageProps<"/editors/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEditor(slug);
  return e ? { title: `${e.person.name} — ${e.person.title}`, description: e.person.bio } : { title: "편집자", robots: { index: false } };
}

export default function EditorPage({ params }: PageProps<"/editors/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 pt-16"><div className="skeleton h-10 w-1/2" /></div>}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: Pick<PageProps<"/editors/[slug]">, "params">) {
  const { slug } = await params;
  const data = await getEditor(slug);
  if (!data) notFound();
  const { person, articles } = data;
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:px-6">
      <p className="hud text-ice">EDITOR</p>
      <div className="mt-4 flex items-center gap-4">
        <div className="text-ice flex size-14 items-center justify-center rounded-2xl border border-line-2 bg-bg-1 text-[22px] font-extrabold" aria-hidden="true">
          {person.name.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-fg">{person.name}</h1>
          <p className="text-[14px] text-fg-3">{person.title}</p>
        </div>
      </div>
      {person.bio && <p className="mt-5 text-[15.5px] leading-relaxed text-fg-2">{person.bio}</p>}
      <p className="mt-3 text-[13px] text-fg-4">편집·검수한 기사 {articles.length}건 — NWM의 AI 초안·보조 기사는 모두 이름이 표시된 편집자가 책임집니다.</p>
      <div className="mt-8">
        <RiverClient cards={articles.map(toMini)} ctx={`editor:${slug}`} label={`${person.name} 편집`} headingLevel={2} />
      </div>
    </main>
  );
}
