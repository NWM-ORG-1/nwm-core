import { getArticle, getHomeData } from "@/data/public";
import { RiverClient } from "@/components/feed/RiverClient";
import { toMini } from "@/components/feed/types";
import { FiveThings } from "@/components/home/FiveThings";
import { ForYou } from "@/components/home/ForYou";
import { Hero } from "@/components/home/Hero";
import { PulseSentiment } from "@/components/home/PulseSentiment";
import { BeatRails, PopularList, SectionHead, StoryList } from "@/components/home/Rails";

export default async function HomePage() {
  const data = await getHomeData();
  const hero = data.hero ? await getArticle(data.hero.lead.slug) : null;

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
      <h1 className="sr-only">NWM 뉴웹미디어 — 지금 알아야 할 신호</h1>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {hero ? (
            <Hero article={hero} updates={data.hero?.updates ?? 1} />
          ) : (
            <div className="panel p-10 text-center text-fg-3">아직 발행된 기사가 없습니다.</div>
          )}
        </div>
        <div className="lg:col-span-4">{data.five.length > 0 && <FiveThings items={data.five} />}</div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-12">
        <section className="lg:col-span-8" aria-labelledby="river-h">
          <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
            <h2 id="river-h" className="flex items-center gap-2.5 text-[19px] font-bold tracking-[-0.02em] text-fg">
              <span className="size-2 animate-pulse-dot rounded-full bg-live" aria-hidden="true" />
              라이브
            </h2>
            <span className="kicker text-fg-4">J / K 로 이동</span>
          </div>
          <RiverClient cards={data.river.map(toMini)} ctx="home:river" label="라이브" live filterable />
        </section>

        <aside className="space-y-8 lg:col-span-4" aria-label="추천과 지표">
          <div className="space-y-8 lg:sticky lg:top-[calc(var(--header-h)+var(--ticker-h)+20px)]">
            <ForYou pool={data.pool.map(toMini)} />
            <PulseSentiment />
            <PopularList items={data.popular} />
            <StoryList stories={data.stories} />
          </div>
        </aside>
      </div>

      <div className="mt-16">
        <SectionHead title="분야별 최신" href="/latest" more="전체 기사" />
        <BeatRails rails={data.rails} />
      </div>
    </main>
  );
}
