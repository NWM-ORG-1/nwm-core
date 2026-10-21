"use client";

import Link from "next/link";
import { usePulse } from "@/lib/client/pulse";
import { Gauge } from "@/components/ui/Gauge";

/** Home widget: NWM Sentiment Index from the live pulse (not baked into HTML). */
export function PulseSentiment() {
  const pulse = usePulse();
  const s = pulse?.senti;
  return (
    <section aria-labelledby="senti-h" className="panel brackets p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 id="senti-h" className="kicker text-fg-3">
          NWM 센티먼트 인덱스
        </h2>
        <Link href="/sentiment" className="text-[12px] text-ice hover:underline">
          대시보드 →
        </Link>
      </div>
      <div className="flex h-[150px] items-center justify-center">
        {s ? (
          <div className="flex flex-col items-center">
            <Gauge score={s.score} size={180} />
            <p className={`tabular -mt-0.5 font-mono text-[12px] ${s.ch > 0 ? "text-up" : s.ch < 0 ? "text-down" : "text-flat"}`}>
              24h {s.ch > 0 ? "▲" : s.ch < 0 ? "▼" : ""}
              {Math.abs(Math.round(s.ch))}
            </p>
          </div>
        ) : (
          <div className="skeleton h-[120px] w-[180px] opacity-60" />
        )}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-fg-4">커뮤니티·소셜 언급의 긍정·부정을 집계한 지수 (−100 공포 ~ +100 탐욕)</p>
    </section>
  );
}
