import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 text-center">
      <Link href="/" aria-label="NWM 홈">
        <Wordmark size="lg" />
      </Link>
      <p className="font-pixel mt-10 text-[64px] leading-none text-ice/80">404</p>
      <h1 className="mt-6 text-[22px] font-bold text-fg">신호를 찾지 못했습니다</h1>
      <Link href="/" className="mt-8 inline-flex h-10 items-center rounded-full bg-ice px-5 text-[14px] font-bold text-bg hover:bg-ice-2">
        홈으로
      </Link>
    </main>
  );
}
