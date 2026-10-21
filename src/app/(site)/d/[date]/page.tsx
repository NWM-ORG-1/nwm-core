import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getArchiveDays, getDay } from "@/data/public";
import { dateKST, isYmd } from "@/lib/format";
import { RiverClient } from "@/components/feed/RiverClient";
import { toMini } from "@/components/feed/types";

export async function generateStaticParams() {
  const days = await getArchiveDays(7);
  return days.length ? days.map((date) => ({ date })) : [{ date: "2026-01-01" }];
}

export async function generateMetadata({ params }: PageProps<"/d/[date]">): Promise<Metadata> {
  const { date } = await params;
  if (!isYmd(date)) return { title: "페이지를 찾을 수 없습니다", robots: { index: false } };
  // An empty day is a valid page (today before the first publish) but not worth indexing.
  const cards = await getDay(date);
  return { title: `${date} 기사`, alternates: { canonical: `/d/${date}` }, robots: cards.length ? undefined : { index: false } };
}

export default function DayPage({ params }: PageProps<"/d/[date]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 pt-16"><div className="skeleton h-10 w-1/2" /></div>}>
      <Day params={params} />
    </Suspense>
  );
}

async function Day({ params }: Pick<PageProps<"/d/[date]">, "params">) {
  const { date } = await params;
  if (!isYmd(date)) notFound();
  const [cards, days] = await Promise.all([getDay(date), getArchiveDays(60)]);
  const i = days.indexOf(date);
  const newer = i > 0 ? days[i - 1] : null;
  const older = i >= 0 && i < days.length - 1 ? days[i + 1] : null;
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-10 sm:px-6">
      <p className="hud text-ice">ARCHIVE</p>
      <h1 className="mt-3 text-[34px] font-extrabold tracking-[-0.035em] text-fg">{dateKST(`${date}T12:00:00+09:00`)}</h1>
      <p className="mt-2 text-[15px] text-fg-3">이날 발행된 기사 {cards.length}건</p>
      <nav className="mt-5 flex gap-2 text-[13px]" aria-label="날짜 이동">
        {older && (
          <Link href={`/d/${older}`} className="rounded-full border border-line px-3 py-1.5 text-fg-2 hover:border-line-2">
            ← {older}
          </Link>
        )}
        {newer && (
          <Link href={`/d/${newer}`} className="rounded-full border border-line px-3 py-1.5 text-fg-2 hover:border-line-2">
            {newer} →
          </Link>
        )}
      </nav>
      <div className="mt-8">
        {cards.length ? <RiverClient cards={cards.map(toMini)} ctx={`day:${date}`} label={date} dayHeaders={false} headingLevel={2} /> : <p className="py-16 text-center text-fg-3">이날 발행된 기사가 없습니다.</p>}
      </div>
    </main>
  );
}
