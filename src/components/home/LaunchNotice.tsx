import Link from "next/link";
import { BEATS, NAV_BEATS } from "@/lib/beats";
import { SITE } from "@/lib/site";
import { beatDotClass } from "@/components/ui/BeatChip";
import { Icon } from "@/components/ui/Icon";
import { OrbitBackdrop } from "@/components/ui/OrbitBackdrop";

const BEAT_COLS = NAV_BEATS.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-5";

/**
 * The front page before the first article: what the paper covers and how to
 * reach the desk. The home page shows it only while nothing is published, so
 * the first publish (which revalidates the feed) replaces it on its own.
 */
export function LaunchNotice({ email }: { email: string }) {
  return (
    <div className="space-y-5">
      <section aria-labelledby="launch-h" className="scanlines relative overflow-hidden rounded-[22px] border border-line bg-bg-1">
        <OrbitBackdrop className="absolute inset-0 h-full w-full opacity-90" />
        <div className="bg-grid absolute inset-0 opacity-60" aria-hidden="true" />
        <div className="relative px-6 py-14 sm:px-10 sm:py-20 lg:px-14 lg:py-24">
          <p className="hud mb-6 inline-flex items-center gap-2 text-ice">
            <span className="size-1.5 rounded-full bg-ice" aria-hidden="true" />
            NOTICE
          </p>
          <h1 id="launch-h" className="text-ice max-w-[16em] text-[32px] font-extrabold leading-[1.18] tracking-[-0.035em] sm:text-[44px] lg:text-[52px]">
            뉴웹미디어는 창간을 준비하고 있습니다
          </h1>
          <p className="mt-5 max-w-[34em] text-balance text-[17px] leading-relaxed text-fg-2 sm:text-[18px]">
            {SITE.fields} 분야의 소식과 투자자 심리를 다루는 인터넷신문입니다. 곧 첫 기사로 찾아뵙겠습니다.
          </p>
          <p className="mt-8 text-[14.5px] text-fg-3">
            제보와 문의는{" "}
            <a href={`mailto:${email}`} className="font-semibold text-fg underline decoration-line-3 underline-offset-4 hover:decoration-ice">
              {email}
            </a>
            로 보내 주세요.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-fg-3">
            <Link href="/about" className="hover:text-fg">
              회사 소개 →
            </Link>
            <Link href="/policy/ai" className="hover:text-fg">
              AI 활용 원칙 →
            </Link>
            <Link href="/rss.xml" prefetch={false} className="inline-flex items-center gap-1.5 hover:text-fg">
              <Icon name="rss" size={14} /> RSS
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="launch-beats-h">
        <h2 id="launch-beats-h" className="kicker mb-3 mt-10 text-fg-3">
          다루는 분야
        </h2>
        <ul className={`grid gap-3 sm:grid-cols-2 ${BEAT_COLS}`}>
          {NAV_BEATS.map((b) => (
            <li key={b} className="panel p-5">
              <p className="flex items-center gap-2 text-[15px] font-bold text-fg">
                <span className={`size-2 rounded-full ${beatDotClass(b)}`} aria-hidden="true" />
                {BEATS[b].label}
              </p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-3">{BEATS[b].blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
