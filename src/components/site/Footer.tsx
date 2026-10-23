import Link from "next/link";
import { BEATS, BEAT_ORDER } from "@/lib/beats";
import { foundedYear, LEGAL_CONTACT_KEYS, LEGAL_FIELDS, PENDING, SITE, type Legal } from "@/lib/site";
import { Icon } from "@/components/ui/Icon";
import { Wordmark } from "@/components/ui/Wordmark";

export function Footer({ legal }: { legal: Legal }) {
  return (
    <footer className="mt-24 border-t border-line bg-bg-1/40">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_0.8fr_0.8fr_1.6fr]">
        <div>
          <Wordmark size="md" withName />
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-fg-3">
            {SITE.tagline} AI·크립토·경제·테크와 투자자 심리를 짧고 구조적으로 전합니다.
          </p>
          <div className="mt-5 flex items-center gap-3 text-fg-3">
            <Link href="/rss.xml" className="inline-flex items-center gap-1.5 text-[13px] hover:text-fg" prefetch={false}>
              <Icon name="rss" size={14} /> RSS
            </Link>
            <span className="text-fg-4">·</span>
            <a href={`mailto:${legal.email}`} className="text-[13px] hover:text-fg">
              {legal.email}
            </a>
          </div>
          {legal.reportEmail !== legal.email && (
            <p className="mt-2 text-[13px] text-fg-3">
              제보·정정{" "}
              <a href={`mailto:${legal.reportEmail}`} className="hover:text-fg">
                {legal.reportEmail}
              </a>
            </p>
          )}
        </div>

        <nav aria-label="하단 분야 메뉴">
          <p className="kicker mb-3 text-fg-4">분야</p>
          <ul className="space-y-2 text-[14px]">
            {BEAT_ORDER.map((b) => (
              <li key={b}>
                <Link href={BEATS[b].path} className="text-fg-3 hover:text-fg">
                  {BEATS[b].label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/latest" className="text-fg-3 hover:text-fg">
                최신 기사
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="원칙과 정책">
          <p className="kicker mb-3 text-fg-4">원칙</p>
          <ul className="space-y-2 text-[14px]">
            <li><Link href="/about" className="text-fg-3 hover:text-fg">NWM 소개</Link></li>
            <li><Link href="/policy/ai" className="text-fg-3 hover:text-fg">AI 활용 원칙</Link></li>
            <li><Link href="/policy/corrections" className="text-fg-3 hover:text-fg">정정·반론 보도 신청</Link></li>
            <li><Link href="/corrections" className="text-fg-3 hover:text-fg">정정 기록</Link></li>
            <li><Link href="/policy/youth" className="text-fg-3 hover:text-fg">청소년보호정책</Link></li>
            <li><Link href="/policy/privacy" className="text-fg-3 hover:text-fg font-semibold">개인정보처리방침</Link></li>
            <li><Link href="/policy/terms" className="text-fg-3 hover:text-fg">이용약관</Link></li>
          </ul>
        </nav>

        <div>
          <p className="kicker mb-3 text-fg-4">발행 정보</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px] leading-relaxed">
            {LEGAL_FIELDS.filter((f) => !LEGAL_CONTACT_KEYS.has(f.key)).map((f) => (
              <div key={f.key} className="contents">
                <dt className="text-fg-4">{f.label}</dt>
                <dd className={legal[f.key] === PENDING ? "text-fg-4" : "text-fg-3"}>{legal[f.key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-2 px-4 py-5 text-[12px] text-fg-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {foundedYear(legal.foundedAt)} {SITE.nameEn}. 모든 기사에는 AI 활용 여부와 책임 편집자를 표시합니다.</p>
          <p className="font-mono tracking-wider">{SITE.domain}</p>
        </div>
      </div>
    </footer>
  );
}
