import type { Metadata } from "next";
import Link from "next/link";
import { DocList, DocPage, DocSection } from "@/components/site/DocPage";

export const metadata: Metadata = {
  title: "센티먼트 인덱스 산출 방법",
  description: "NWM 센티먼트 인덱스의 입력 데이터, 가중치, 표준화, AI 분류 방식과 한계.",
};

/** Methodology for the sentiment index (method v1). Keep in step with src/sentiment/compute.ts. */
export default function SentimentMethodPage() {
  return (
    <DocPage
      kicker="METHODOLOGY · v1"
      title="센티먼트 인덱스 산출 방법"
      lead="커뮤니티의 말과 시장의 움직임을 함께 봅니다. −100은 극단적 공포, +100은 극단적 탐욕입니다."
      updated="2026년 10월 · 베타"
    >
      <DocSection title="1. 무엇을 보나">
        <DocList
          items={[
            <>
              <strong>커뮤니티·소셜 (40%)</strong> — 국내 투자 커뮤니티 게시판의 글 제목, 편집국이 지정한 텔레그램 채널과 X 계정의 게시물. 최근 24시간 글을 낙관·비관·중립·무관으로 분류합니다.
            </>,
            <>
              <strong>시장 지표 (45%)</strong> — 코인 선물 펀딩비, 롱숏 계정 비율, 미결제약정 24시간 변화, 김치 프리미엄, 24시간 수익률, 실현 변동성(높을수록 공포로 계산).
            </>,
            <>
              <strong>관심도 (15%)</strong> — 게시물 수가 평소보다 얼마나 많은지. 관심이 쏠린 방향(낙관·비관)에 따라 부호를 붙입니다.
            </>,
          ]}
        />
      </DocSection>
      <DocSection title="2. 어떻게 합치나">
        <DocList
          items={[
            "커뮤니티 점수: 출처 신뢰도와 반응(조회·댓글·추천, 상한 있음)으로 가중한 낙관 합(B)과 비관 합(R)으로 ln((1+B)/(1+R))을 계산합니다 (Antweiler & Frank, 2004).",
            "표준화: 각 입력을 최근 30일의 중앙값과 MAD(중위 절대편차)로 표준화하고 ±3에서 자릅니다. 30일 이력이 쌓이기 전에는 미리 정한 기준값을 쓰며, 그동안은 신뢰도를 낮춰 표시합니다.",
            "결합: 가중 평균(Z)을 100 × tanh(Z/2)로 −100…+100 범위에 옮기고, 6시간 반감기로 평활합니다. 데이터가 없는 부분은 빼고 나머지 가중치로 다시 나눕니다.",
            "종목별 지수는 24시간 동안 20건 이상 언급된 종목만 냅니다. 표본이 적은 종목의 숫자는 내지 않습니다.",
            "신뢰도(0–100%)는 표본 수, 입력 범위, 기준선(30일 이력) 성숙도로 계산해 함께 공개합니다.",
          ]}
        />
      </DocSection>
      <DocSection title="3. AI를 이렇게 씁니다">
        <DocList
          items={[
            "글의 낙관·비관 분류에는 AI 모델(Anthropic Claude)을 씁니다. 작성자 이름은 보내지 않고, 글 속 지시문은 따르지 않도록 합니다.",
            "AI 분석에 동의하지 않은 채널(예: 운영자 동의가 없는 텔레그램 채널)의 글과, AI 비용 한도를 넘긴 경우에는 규칙 기반 사전(은어 포함)으로만 분류합니다.",
            "AI가 만든 숫자를 기사에 쓸 때는 다른 AI 활용과 마찬가지로 표시하고 편집자가 검수합니다.",
          ]}
        />
        <p className="mt-3">
          자세한 원칙은 <Link href="/policy/ai" className="text-ice hover:underline">AI 활용 원칙</Link>을 참고하세요.
        </p>
      </DocSection>
      <DocSection title="4. 개인정보와 출처">
        <DocList
          items={[
            "게시물 원문과 작성자는 화면에 공개하지 않습니다. 분류에 쓴 글의 본문은 일주일 뒤 지우고 점수·건수만 남깁니다.",
            "커뮤니티는 각 사이트의 robots.txt를 따르거나 운영자와 협의된 범위에서만 목록 페이지를 읽습니다. 게시물 본문은 읽지 않습니다.",
            "시세·선물 지표는 각 거래소의 공개 API, 환율은 공식 기준환율에서 가져옵니다.",
          ]}
        />
      </DocSection>
      <DocSection title="5. 한계">
        <DocList
          items={[
            "커뮤니티 글은 전체 투자자를 대표하지 않으며, 조직적 게시나 반어·조롱을 완전히 걸러내지 못할 수 있습니다.",
            "시장 지표는 주로 코인 파생상품 시장에서 나옵니다. 주식 종목의 지수는 커뮤니티 입력 비중이 더 큽니다.",
            "방법을 바꾸면 버전 번호(v1, v2…)와 함께 이 페이지에 바뀐 점을 기록합니다.",
          ]}
        />
      </DocSection>
      <DocSection title="투자 권유가 아닙니다">
        <p>이 지표는 시장 분위기를 보여주는 참고 정보입니다. 특정 자산의 매수·매도를 권하지 않으며, 투자 판단과 그 결과의 책임은 투자자 본인에게 있습니다.</p>
      </DocSection>
    </DocPage>
  );
}
