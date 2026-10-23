import Link from "next/link";

export default function SiteNotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="font-pixel text-[64px] leading-none text-ice/80">404</p>
      <h1 className="mt-6 text-[24px] font-bold tracking-[-0.02em] text-fg">페이지를 찾을 수 없습니다</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-3">주소가 바뀌었거나 비공개로 전환된 기사일 수 있습니다.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link href="/" className="inline-flex h-10 items-center rounded-full bg-ice px-5 text-[14px] font-bold text-bg hover:bg-ice-2">
          홈으로
        </Link>
        <Link href="/latest" className="inline-flex h-10 items-center rounded-full border border-line-2 px-5 text-[14px] font-semibold text-fg-2 hover:text-fg">
          최신 기사
        </Link>
        <Link href="/search" className="inline-flex h-10 items-center rounded-full border border-line-2 px-5 text-[14px] font-semibold text-fg-2 hover:text-fg">
          검색
        </Link>
      </div>
    </main>
  );
}
