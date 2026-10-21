import type { Beat } from "@/db/schema";
import { getBeatData } from "@/data/public";
import { BEATS } from "@/lib/beats";
import { RiverClient } from "@/components/feed/RiverClient";
import { toMini } from "@/components/feed/types";
import { StoryList } from "@/components/home/Rails";
import { BeatHeader } from "./BeatHeader";
import { TopCards } from "./TopCards";

export async function BeatPage({ beat, children }: { beat: Beat; children?: React.ReactNode }) {
  const data = await getBeatData(beat);
  const meta = BEATS[beat];
  return (
    <main>
      <BeatHeader beat={beat} count24h={data.count24h} />
      <div className="mx-auto max-w-[1320px] px-4 pt-8 sm:px-6">
        <TopCards items={data.top} ctx={`beat:${beat}:top`} label={`${meta.label} 주요`} />
        {children}
        <div className="mt-14 grid gap-10 lg:grid-cols-12">
          <section className="lg:col-span-8" aria-labelledby="beat-river-h">
            <h2 id="beat-river-h" className="mb-2 border-b border-line pb-2.5 text-[19px] font-bold tracking-[-0.02em] text-fg">
              {meta.label} 최신
            </h2>
            <RiverClient cards={data.river.map(toMini)} ctx={`beat:${beat}`} label={meta.label} showBeat={false} />
          </section>
          <aside className="lg:col-span-4">
            <div className="space-y-8 lg:sticky lg:top-[calc(var(--header-h)+var(--ticker-h)+20px)]">
              <StoryList stories={data.stories} />
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

export function beatMetadata(beat: Beat) {
  const meta = BEATS[beat];
  return {
    title: meta.label,
    description: meta.blurb,
    alternates: { canonical: meta.path },
  };
}
