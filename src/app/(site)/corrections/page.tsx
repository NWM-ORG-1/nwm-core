import type { Metadata } from "next";
import Link from "next/link";
import { getCorrectionsLog } from "@/data/public";
import { BEATS } from "@/lib/beats";
import { dateTimeKST } from "@/lib/format";

export const metadata: Metadata = { title: "정정 기록", description: "NWM이 발행 후 바로잡은 모든 기록." };

const KIND: Record<string, string> = { correction: "정정", clarification: "바로잡음", update: "업데이트" };

export default async function CorrectionsPage() {
  const rows = await getCorrectionsLog();
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-12 sm:px-6">
      <p className="hud text-ice">TRANSPARENCY</p>
      <h1 className="mt-3 text-[34px] font-extrabold tracking-[-0.035em] text-fg">정정 기록</h1>
      <p className="mt-3 text-[15.5px] leading-relaxed text-fg-2">
        틀린 것은 고치고, 고친 사실은 숨기지 않습니다. 기사 본문을 바로잡은 뒤 무엇을 왜 고쳤는지 이곳과 해당 기사 하단에 함께 남깁니다.{" "}
        <Link href="/policy/corrections" className="text-ice hover:underline">
          정정·반론 신청 →
        </Link>
      </p>
      <ol className="mt-10 space-y-4">
        {rows.map((r, i) => (
          <li key={i} className="panel p-5">
            <p className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
              <span className="kicker rounded border border-warn/40 px-1.5 text-warn">{KIND[r.kind]}</span>
              <span>{BEATS[r.beat].label}</span>
              <span aria-hidden="true">·</span>
              <span>{dateTimeKST(r.publishedAt)}</span>
              <span aria-hidden="true">·</span>
              <span>r{r.revision}</span>
            </p>
            <Link href={`/a/${r.slug}`} className="mt-2 block text-[17px] font-bold leading-snug text-fg hover:text-ice-2">
              {r.title}
            </Link>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-fg-2">{r.note}</p>
          </li>
        ))}
        {rows.length === 0 && <li className="py-16 text-center text-fg-3">아직 정정 기록이 없습니다.</li>}
      </ol>
    </main>
  );
}
