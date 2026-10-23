import type { Metadata } from "next";
import Link from "next/link";
import { getArchiveDays, getLatest } from "@/data/public";
import { RiverClient } from "@/components/feed/RiverClient";
import { toMini } from "@/components/feed/types";

export const metadata: Metadata = { title: "최신 기사", description: "뉴웹미디어의 모든 기사를 발행 순서대로 모았습니다.", alternates: { canonical: "/latest" } };

export default async function LatestPage() {
  const [cards, days] = await Promise.all([getLatest(150), getArchiveDays(14)]);
  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-10 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <p className="hud text-ice">RIVER</p>
          <h1 className="mt-3 text-[34px] font-extrabold tracking-[-0.035em] text-fg">최신 기사</h1>
          <p className="mt-2 text-[15px] text-fg-3">모든 기사를 최신순으로 보여 드립니다. J·K 키로 이동하고 Enter로 엽니다.</p>
          <div className="mt-8">
            <RiverClient cards={cards.map(toMini)} ctx="latest" label="최신 기사" live filterable headingLevel={2} />
          </div>
        </div>
        <aside className="lg:col-span-4">
          <div className="lg:sticky lg:top-[calc(var(--header-h)+var(--ticker-h)+20px)]">
            <h2 className="kicker mb-3 text-fg-3">날짜별 아카이브</h2>
            <ul className="grid grid-cols-2 gap-2">
              {days.map((d) => (
                <li key={d}>
                  <Link href={`/d/${d}`} className="tabular block rounded-lg border border-line px-3 py-2 font-mono text-[13px] text-fg-2 hover:border-line-2 hover:text-fg">
                    {d}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
