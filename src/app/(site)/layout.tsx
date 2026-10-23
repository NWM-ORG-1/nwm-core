import type { Metadata } from "next";
import { getSiteFlags } from "@/data/public";
import { Analytics } from "@/components/site/Analytics";
import { DemoBanner } from "@/components/site/DemoBanner";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Ticker } from "@/components/site/Ticker";

/**
 * Every public route must be fully static (prerendered, CDN-cacheable).
 * The build fails if anything below reads cookies/headers/searchParams on the
 * server or does uncached I/O.
 */
export const ensureStatic = "navigation";

export async function generateMetadata(): Promise<Metadata> {
  const { demo } = await getSiteFlags();
  return demo ? { robots: { index: false, follow: false } } : {};
}

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const flags = await getSiteFlags();
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-bg-1 focus:px-3 focus:py-2 focus:text-[14px]"
      >
        본문 바로가기
      </a>
      {flags.demo && <DemoBanner />}
      <Header />
      <Ticker />
      <div id="main" className="min-h-[60vh]">
        {children}
      </div>
      <Footer legal={flags.legal} />
      <Analytics />
    </>
  );
}
