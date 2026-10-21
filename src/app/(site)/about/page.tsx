import type { Metadata } from "next";
import Link from "next/link";
import { DocList, DocPage, DocSection } from "@/components/site/DocPage";
import { BLOCK_TITLE_KO, SECTION_LABEL_KO } from "@/lib/content/blocks";

export const metadata: Metadata = { title: "NWM 소개", description: "소음은 빼고, 신호만. 뉴웹미디어가 일하는 방식." };

export default function AboutPage() {
  return (
    <DocPage kicker="ABOUT" title="소음은 빼고, 신호만." lead="뉴웹미디어(NWM)는 AI·크립토·경제·테크, 그리고 투자자 심리를 다루는 인터넷 신문입니다. 길게 쓰지 않습니다. 지금 알아야 할 것과 그 이유를, 구조적으로 전합니다.">
      <DocSection title="짧고, 구조적으로">
        <p>모든 기사는 한 줄의 시그널로 시작하고, 정해진 형식의 블록으로 이어집니다. 끝까지 읽지 않아도 핵심을 놓치지 않도록.</p>
        <DocList
          items={[
            <><strong>{BLOCK_TITLE_KO.why}</strong> — 이 소식이 당신에게 왜 중요한지</>,
            <><strong>{BLOCK_TITLE_KO.numbers}</strong> — 판단에 필요한 핵심 수치</>,
            <><strong>{SECTION_LABEL_KO.big_picture} · {SECTION_LABEL_KO.between_lines} · {SECTION_LABEL_KO.yes_but}</strong> — 맥락과 행간, 그리고 반대 근거</>,
            <><strong>{BLOCK_TITLE_KO.next}</strong> — 앞으로 지켜볼 것</>,
          ]}
        />
      </DocSection>
      <DocSection title="AI와 함께, 책임은 사람이">
        <p>
          NWM의 기사는 대부분 AI의 도움으로 만들어집니다. 공시·통계·시세 같은 1차 자료에서 출발해 AI가 초안을 쓰고, 이름이 표시된 편집자가 검수해 발행합니다. 모든 기사에는 AI 활용 방식과 책임 편집자가 표시됩니다.{" "}
          <Link href="/policy/ai" className="text-ice hover:underline">AI 활용 원칙 →</Link>
        </p>
      </DocSection>
      <DocSection title="빠르게 읽고, 매끄럽게 넘기기">
        <DocList
          items={[
            "목록에서 기사를 열면 그 목록이 그대로 읽기 큐가 됩니다. 모바일은 좌우로 넘기고, 데스크톱은 J/K 키로 이동하세요.",
            "읽은 기사와 마지막 방문 이후의 새 기사는 이 기기 안에서만 기억합니다. 로그인도, 추적 쿠키도 없습니다.",
            "⌘K(또는 /)로 언제든 검색할 수 있고, Aa 메뉴에서 라이트 읽기 모드와 글자 크기를 바꿀 수 있습니다.",
          ]}
        />
      </DocSection>
      <DocSection title="투자자 심리를 숫자로">
        <p>
          커뮤니티와 소셜의 군중 심리를 집계 지표로 측정해 <Link href="/sentiment" className="text-ice hover:underline">NWM 센티먼트 인덱스</Link>로 공개합니다. 개별 게시물이나 개인을 인용하지 않습니다.
        </p>
      </DocSection>
    </DocPage>
  );
}
