import { getArticle, getHomeData, getSiteFlags } from "@/data/public";
import { QueueScope } from "@/components/feed/QueueScope";
import { RiverClient } from "@/components/feed/RiverClient";
import { toMini } from "@/components/feed/types";
import { FiveThings } from "@/components/home/FiveThings";
import { ForYou } from "@/components/home/ForYou";
import { Hero } from "@/components/home/Hero";
import { LaunchNotice } from "@/components/home/LaunchNotice";
import { PulseSentiment } from "@/components/home/PulseSentiment";
import { BeatRails, PopularList, SectionHead, StoryList } from "@/components/home/Rails";

export default async function HomePage() {
  const data = await getHomeData();
  // Nothing published yet: show the launch notice until the first article goes out.
  if (!data.hero && data.river.length === 0) {
    const { legal } = await getSiteFlags();
    return (
      <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
        <LaunchNotice email={legal.reportEmail} />
      </main>
    );
  }
  const hero = data.hero ? await getArticle(data.hero.lead.slug) : null;
  // Opening the lead starts the same "what to know" list the five-things panel uses.
  const topQueue = data.hero
    ? [data.hero.lead, ...data.five.map((f) => f.lead)].map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }))
    : [];

  return (
    <main className="mx-auto max-w-[1320px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
      <h1 className="sr-only">뉴웹미디어 주요 뉴스</h1>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {hero ? (
            <QueueScope ctx="home:top" label="주요 뉴스" items={topQueue}>
              <Hero article={hero} updates={data.hero?.updates ?? 1} />
            </QueueScope>
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
              실시간
            </h2>
            <span className="kicker text-fg-4">J·K 키로 이동</span>
          </div>
          <RiverClient cards={data.river.map(toMini)} ctx="home:river" label="실시간" live filterable />
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
