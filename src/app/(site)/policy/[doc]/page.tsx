import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSiteFlags } from "@/data/public";
import { AI_LABEL } from "@/lib/labels";
import { PENDING } from "@/lib/site";
import { DocList, DocPage, DocSection } from "@/components/site/DocPage";

const DOCS = {
  ai: "AI 활용 원칙",
  corrections: "정정·반론 보도 신청",
  youth: "청소년보호정책",
  privacy: "개인정보처리방침",
  terms: "이용약관",
} as const;
type Doc = keyof typeof DOCS;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<"/policy/[doc]">): Promise<Metadata> {
  const { doc } = await params;
  return doc in DOCS ? { title: DOCS[doc as Doc] } : { title: "문서를 찾을 수 없습니다" };
}

export default function PolicyPage({ params }: PageProps<"/policy/[doc]">) {
  return (
    <Suspense fallback={null}>
      <Policy params={params} />
    </Suspense>
  );
}

async function Policy({ params }: Pick<PageProps<"/policy/[doc]">, "params">) {
  const { doc } = await params;
  if (!(doc in DOCS)) notFound();
  const { legal } = await getSiteFlags();
  switch (doc as Doc) {
    case "ai":
      return (
        <DocPage kicker="AI POLICY" title="AI 활용 원칙" lead="NWM은 AI를 취재와 작성의 도구로 씁니다. 판단과 책임은 사람에게 있습니다." updated="2026년 10월 (초안)">
          <DocSection title="1. 모든 기사에 표시합니다">
            <p>기사마다 AI가 어떻게 쓰였는지 배지로 표시하고, 기계가 읽을 수 있는 메타데이터(IPTC 디지털 출처 유형)도 함께 제공합니다.</p>
            <DocList
              items={(Object.keys(AI_LABEL) as Array<keyof typeof AI_LABEL>).map((k) => (
                <>
                  <strong>{AI_LABEL[k].long.replace("{editor}", "편집자")}</strong> — {AI_LABEL[k].explain}
                </>
              ))}
            />
          </DocSection>
          <DocSection title="2. 책임 편집자를 밝힙니다">
            <p>AI 초안과 AI 보조 기사는 반드시 실명의 편집자가 사실관계·수치·출처를 검수한 뒤 발행합니다. 시스템이 편집자 없이 이런 기사를 발행할 수 없도록 데이터베이스 수준에서 막고 있습니다.</p>
          </DocSection>
          <DocSection title="3. 1차 자료에서 출발합니다">
            <DocList
              items={[
                "공시, 공공 통계, 보도자료, 시세·온체인 데이터 등 1차 자료를 우선 사용합니다.",
                "다른 언론사의 기사는 재작성하거나 인용하지 않습니다. 사건의 존재를 알리는 신호로만 쓰고, 반드시 1차 자료를 직접 확인합니다.",
                "데이터 자동 기사의 수치는 AI가 쓰지 않습니다. 원천 데이터를 코드로 그대로 채웁니다.",
                "발행 전 출처·라이선스·수치 대조·중복·법률 검토 체크를 거칩니다.",
              ]}
            />
          </DocSection>
          <DocSection title="4. 고친 것은 남깁니다">
            <p>
              오류가 확인되면 본문을 바로잡고, 무엇을 왜 고쳤는지 기사 하단과 <Link href="/corrections" className="text-ice hover:underline">정정 기록</Link>에 공개합니다.
            </p>
          </DocSection>
          <DocSection title="5. 독자 데이터를 학습에 쓰지 않습니다">
            <p>추천과 읽음 기록은 독자의 기기 안에서만 계산·저장됩니다. 서버에는 개인을 식별하지 않는 기사별 조회·완독 집계만 남습니다.</p>
          </DocSection>
          <DocSection title="6. 센티먼트 지수의 AI 분류">
            <p>
              센티먼트 인덱스는 커뮤니티·소셜 게시물의 낙관·비관 분류에 AI(Anthropic Claude)를 씁니다. AI 분석에 동의하지 않은 출처는 규칙 기반으로만 분류합니다. 방법과 한계는{" "}
              <Link href="/sentiment/method" className="text-ice hover:underline">
                산출 방법
              </Link>
              에 공개합니다.
            </p>
          </DocSection>
        </DocPage>
      );
    case "corrections":
      return (
        <DocPage kicker="CORRECTIONS" title="정정·반론 보도 신청" lead="보도로 피해를 입었거나 사실과 다른 내용을 발견했다면 알려주세요." updated="2026년 10월 (초안)">
          <DocSection title="신청 방법">
            <DocList
              items={[
                <>이메일: <a className="text-ice hover:underline" href={`mailto:${legal.reportEmail}`}>{legal.reportEmail}</a> (기사 주소, 정정을 원하는 내용, 근거, 연락처)</>,
                "접수 후 3일 이내에 회신하고, 정정이 필요한 경우 지체 없이(늦어도 7일 이내) 본문을 바로잡고 정정 사실을 공개합니다.",
                "정정 보도와 별도로 반론 보도, 추후 보도를 청구할 수 있습니다. 언론중재위원회를 통한 조정 신청도 가능합니다.",
              ]}
            />
          </DocSection>
          <DocSection title="처리 원칙">
            <p>정정은 원문 기사 자체를 수정하는 방식으로 하며, 수정 이력과 사유를 기사 하단 및 정정 기록 페이지에 남깁니다.</p>
          </DocSection>
        </DocPage>
      );
    case "youth":
      return (
        <DocPage kicker="YOUTH" title="청소년보호정책" lead="NWM은 청소년에게 유해한 정보를 게재하지 않으며, 청소년보호책임자를 지정해 관리합니다." updated="2026년 10월 (초안)">
          <DocSection title="운영 원칙">
            <DocList items={["음란·폭력·사행성 등 청소년 유해 정보를 게재하지 않습니다.", "광고는 청소년 유해 업종을 받지 않습니다.", "유해 정보 신고는 청소년보호책임자에게 접수되며 신속히 조치합니다."]} />
          </DocSection>
          <DocSection title="청소년보호책임자">
            <p>성명·연락처는 사이트 하단 발행 정보에 표시됩니다. (인터넷신문 등록 후 확정)</p>
          </DocSection>
        </DocPage>
      );
    case "privacy":
      return (
        <DocPage kicker="PRIVACY" title="개인정보처리방침" lead="NWM은 회원 가입 없이 읽는 서비스로, 독자의 개인정보를 수집하지 않습니다." updated="2026년 10월 (초안)">
          <DocSection title="수집하지 않는 것">
            <DocList items={["이름·이메일·전화번호 등 개인 식별 정보", "추적 쿠키 및 제3자 광고 추적 스크립트"]} />
          </DocSection>
          <DocSection title="기기에만 저장되는 것">
            <p>읽은 기사 기록, 마지막 방문 시각, 화면 설정(다크/라이트, 글자 크기)은 브라우저 저장소에만 보관되며 서버로 전송되지 않습니다. 브라우저 설정에서 언제든 삭제할 수 있습니다.</p>
          </DocSection>
          <DocSection title="서버에 남는 것">
            <p>기사별 조회·완독·다음 기사 이동 횟수를 개인을 식별할 수 없는 집계로만 기록합니다. 서비스 보안을 위한 접속 기록은 법령이 정한 기간 동안 보관 후 파기합니다.</p>
          </DocSection>
          <DocSection title="개인정보 보호책임자">
            {legal.privacyOfficer === PENDING ? (
              <p>보호책임자는 인터넷신문 등록 후 이 페이지와 사이트 하단 발행 정보에 공개합니다.</p>
            ) : (
              <DocList
                items={[
                  <>성명: {legal.privacyOfficer}</>,
                  <>
                    연락처: <a className="text-ice hover:underline" href={`mailto:${legal.email}`}>{legal.email}</a>
                    {legal.phone !== PENDING ? ` · ${legal.phone}` : ""}
                  </>,
                ]}
              />
            )}
          </DocSection>
        </DocPage>
      );
    case "terms":
      return (
        <DocPage kicker="TERMS" title="이용약관" lead="NWM의 기사와 데이터는 정보 제공 목적이며, 투자 권유가 아닙니다." updated="2026년 10월 (초안)">
          <DocSection title="투자 관련 고지">
            <p>시세·심리 지표와 기사는 투자 판단의 참고 자료일 뿐이며, 투자에 따른 결과의 책임은 이용자 본인에게 있습니다.</p>
          </DocSection>
          <DocSection title="저작권">
            <p>NWM이 작성한 기사의 저작권은 NWM에 있습니다. 출처를 밝힌 인용은 환영하지만, 전문 복제와 AI 학습을 위한 무단 수집은 허용하지 않습니다.</p>
          </DocSection>
        </DocPage>
      );
  }
}
