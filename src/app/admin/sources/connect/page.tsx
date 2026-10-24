import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getSocialConnectInfo } from "@/data/admin-ingest";
import { btn, cx, PageHeader } from "@/components/admin/ui";
import { FormSkeleton } from "@/components/admin/feeds/bits";
import { SocialConnect } from "@/components/admin/feeds/SocialConnect";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "텔레그램·X 연결" };

export default function ConnectSourcesPage() {
  return (
    <>
      <PageHeader
        kicker="SOURCES · CONNECT"
        title="텔레그램·X 연결"
        description="채널 링크나 계정을 붙여넣으면 확인한 뒤 채널·계정마다 소스를 만들고 바로 수집을 시작합니다."
        actions={
          <Link href="/admin/sources" className={cx(btn.base, btn.ghost)}>
            <Icon name="arrowLeft" size={14} /> 소스 목록
          </Link>
        }
      />
      <Suspense fallback={<FormSkeleton />}>
        <Body />
      </Suspense>
    </>
  );
}

async function Body() {
  const { xKey } = await getSocialConnectInfo();
  return (
    <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 max-w-4xl">
        <SocialConnect xKey={xKey} />
      </div>
      <aside className="space-y-3 text-[12.5px] leading-relaxed text-fg-3">
        <section className="panel p-4">
          <h2 className="mb-2 text-[13px] font-semibold text-fg-2">텔레그램</h2>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>공개 채널만 됩니다. 채널의 공개 미리보기(t.me/s)에서 새 글을 2분마다 읽습니다.</li>
            <li>개인 계정·봇·비공개 채널(초대 링크)은 수집할 수 없습니다.</li>
            <li>텔레그램 약관상 채널 운영자의 동의가 필요합니다. 동의 여부는 소스마다 기록되고, 동의가 없는 채널은 AI가 쓰지 않습니다.</li>
          </ul>
        </section>
        <section className="panel p-4">
          <h2 className="mb-2 text-[13px] font-semibold text-fg-2">X</h2>
          <ul className="list-disc space-y-1.5 pl-4">
            <li>공식 API로 계정의 새 게시물만 읽습니다(답글·리포스트 제외). 게시물 1건에 $0.005.</li>
            <li>기사에는 게시물을 공식 임베드로만 보여 줍니다.</li>
            <li>계정마다 소스가 하나씩 생겨, 소스 화면에서 따로 끄고 켤 수 있습니다.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}
