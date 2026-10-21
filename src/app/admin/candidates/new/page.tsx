import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAdminShell } from "@/data/admin";
import { isBeat } from "@/lib/beats";
import { AI_LABEL, aiLabelLong } from "@/lib/labels";
import { btn, cx, ModeBadge, PageHeader } from "@/components/admin/ui";
import { IdeaForm } from "@/components/admin/candidates/IdeaForm";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "아이디어로 시작" };

export default function NewCandidatePage({ searchParams }: PageProps<"/admin/candidates/new">) {
  return (
    <>
      <PageHeader
        kicker="PIPELINE · MODE C"
        title="아이디어로 시작"
        description="편집자의 기획에서 출발하는 후보입니다. AI는 자료 정리와 문장 다듬기를 돕고, 기사는 편집자가 직접 쓰고 책임집니다."
        actions={
          <Link href="/admin/candidates" className={cx(btn.base, btn.ghost)}>
            <Icon name="arrowLeft" size={14} /> 후보 보드
          </Link>
        }
      />
      <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,48rem)_340px]">
        <section className="panel min-w-0 p-5 sm:p-6" aria-label="아이디어 입력">
          <Suspense fallback={<FormSkeleton />}>
            <Form searchParams={searchParams} />
          </Suspense>
        </section>
        <Suspense fallback={<div className="skeleton h-80" />}>
          <ModeNote />
        </Suspense>
      </div>
    </>
  );
}

async function Form({ searchParams }: Pick<PageProps<"/admin/candidates/new">, "searchParams">) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.beat) ? sp.beat[0] : sp.beat;
  return <IdeaForm defaultBeat={raw && isBeat(raw) ? raw : undefined} />;
}

async function ModeNote() {
  const { me } = await getAdminShell();
  return (
    <aside className="space-y-3 xl:sticky xl:top-5 xl:self-start" aria-label="모드 C 안내">
      <div className="panel brackets p-5">
        <div className="flex items-center gap-2">
          <ModeBadge mode="editor_idea" />
          <span className="kicker text-fg-3">아이디어 → AI 어시스트</span>
        </div>
        <h2 className="mt-3 text-[15px] font-bold tracking-[-0.01em] text-fg">독자에게는 이렇게 표기됩니다</h2>
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-line-2 px-2 py-[3px] text-[11px] font-medium text-fg-3">
          <span className="hud !text-[9px] !tracking-[0.12em] text-ice" aria-hidden="true">
            AI
          </span>
          {aiLabelLong("ai_assisted", me.name)}
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-fg-3">{AI_LABEL.ai_assisted.explain}</p>
        <ul className="mt-4 space-y-2.5 border-t border-line pt-4 text-[12.5px] leading-relaxed text-fg-2">
          <li className="flex gap-2">
            <Icon name="check" size={14} className="mt-0.5 shrink-0 text-good" />
            <span>
              <b className="font-semibold text-fg">편집자 직접 작성 책임</b> — 발행 버튼을 누른 편집자 이름이 기사와 바이라인(글 · 이름)에 남습니다.
            </span>
          </li>
          <li className="flex gap-2">
            <Icon name="check" size={14} className="mt-0.5 shrink-0 text-good" />
            <span>
              <b className="font-semibold text-fg">1차 출처 필수</b> — 아이디어만으로는 발행할 수 없습니다. 공시·보도자료·데이터 출처를 본문 출처에 연결하세요.
            </span>
          </li>
          <li className="flex gap-2">
            <Icon name="check" size={14} className="mt-0.5 shrink-0 text-good" />
            <span>
              <b className="font-semibold text-fg">AI를 전혀 쓰지 않으면</b> ‘{AI_LABEL.human.long}’으로 표기됩니다. 초안 생성이나 어시스트를 한 번이라도 쓰면 ‘AI 보조’입니다.
            </span>
          </li>
        </ul>
      </div>
      <p className="px-1 text-[11.5px] leading-relaxed text-fg-4">현재 AI 초안은 모의 생성기입니다 — 3단계에서 실제 AI로 교체됩니다. 생성된 문장은 모두 편집자가 검토해야 합니다.</p>
    </aside>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="skeleton h-4 w-28" />
      <div className="skeleton h-[150px]" />
      <div className="skeleton h-9 w-56" />
    </div>
  );
}
