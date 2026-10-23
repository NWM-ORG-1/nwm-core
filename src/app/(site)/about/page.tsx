import type { Metadata } from "next";
import Link from "next/link";
import { DocList, DocPage, DocSection } from "@/components/site/DocPage";
import { BLOCK_TITLE_KO, SECTION_LABEL_KO } from "@/lib/content/blocks";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "회사 소개", description: `${SITE.name}가 기사를 만드는 방식을 소개합니다.` };

export default function AboutPage() {
  return (
    <DocPage
      kicker="ABOUT"
      title="뉴웹미디어를 소개합니다"
      lead={`뉴웹미디어는 ${SITE.fields} 분야를 다루는 인터넷신문입니다. 핵심을 먼저 쓰고, 숫자와 출처를 함께 싣습니다.`}
    >
      <DocSection title="기사는 이렇게 씁니다">
        <p>기사는 한두 문장의 요약으로 시작합니다. 그다음은 정해진 순서로 나눠 써서, 앞부분만 읽어도 무슨 일인지 알 수 있게 합니다.</p>
        <DocList
          items={[
            <>
              <strong>{BLOCK_TITLE_KO.why}</strong>: 이 소식이 독자에게 어떤 의미인지
            </>,
            <>
              <strong>{BLOCK_TITLE_KO.numbers}</strong>: 판단에 필요한 핵심 수치
            </>,
            <>
              <strong>
                {SECTION_LABEL_KO.big_picture}·{SECTION_LABEL_KO.between_lines}·{SECTION_LABEL_KO.yes_but}
              </strong>
              : 배경과 숨은 의미, 반대 근거
            </>,
            <>
              <strong>{BLOCK_TITLE_KO.next}</strong>: 앞으로 확인할 일정과 지표
            </>,
          ]}
        />
      </DocSection>
      <DocSection title="AI를 쓰는 방식">
        <p>
          뉴웹미디어는 기사 작성에 AI를 씁니다. 공시와 통계, 시세 같은 1차 자료를 바탕으로 AI가 초안을 쓰면, 이름을 밝힌 편집자가 사실관계와 수치를 확인한 뒤 발행합니다. 기사마다 AI를 어떻게
          썼는지와 책임 편집자를 표시합니다.{" "}
          <Link href="/policy/ai" className="text-ice hover:underline">
            AI 활용 원칙 보기 →
          </Link>
        </p>
      </DocSection>
      <DocSection title="읽는 방법">
        <DocList
          items={[
            "목록에서 기사를 열면 그 목록 순서대로 다음 기사로 넘어갈 수 있습니다. 모바일에서는 좌우로 밀고, PC에서는 J·K 키를 누르면 됩니다.",
            "읽은 기사와 지난 방문 이후 올라온 기사는 이 기기에만 기록합니다. 로그인이나 추적용 쿠키는 쓰지 않습니다.",
            "⌘K 또는 / 키로 기사를 검색할 수 있고, Aa 메뉴에서 밝은 화면과 글자 크기를 바꿀 수 있습니다.",
          ]}
        />
      </DocSection>
      <DocSection title="투자심리지수">
        <p>
          국내 투자 커뮤니티와 SNS 글, 시장 지표를 모아{" "}
          <Link href="/sentiment" className="text-ice hover:underline">
            NWM 투자심리지수
          </Link>
          를 냅니다. 개별 게시물이나 작성자는 인용하지 않습니다.
        </p>
      </DocSection>
    </DocPage>
  );
}
