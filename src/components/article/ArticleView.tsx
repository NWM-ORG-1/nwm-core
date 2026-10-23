import Link from "next/link";
import type { ArticleCard, ArticleFull, TimelineEntry } from "@/data/dto";
import { BEATS } from "@/lib/beats";
import { readTimeLabel } from "@/lib/content/blocks";
import { clockKST, dateKST, dateTimeKST } from "@/lib/format";
import { AI_DISCLOSURE, AI_LABEL, publicCredit } from "@/lib/labels";
import { AiBadge } from "@/components/ui/AiBadge";
import { BeatChip } from "@/components/ui/BeatChip";
import { LocalTime } from "@/components/ui/LocalTime";
import { IntentLink } from "@/components/feed/IntentLink";
import { QueueScope } from "@/components/feed/QueueScope";
import { ArticleBlocks } from "./ArticleBlocks";
import { CopyLink } from "./CopyLink";

const SOURCE_KIND: Record<string, string> = {
  filing: "공시",
  press: "보도자료",
  data: "데이터",
  social: "소셜",
  report: "리포트",
  news: "언론",
  paper: "논문",
};

const CORRECTION_KIND: Record<string, string> = { correction: "정정", clarification: "바로잡음", update: "업데이트" };

/**
 * Who answers for the article, in place of the AI badge while AI_DISCLOSURE is
 * off: the byline for reporter-written and automatic data pieces, and the
 * responsible editor ("편집 …") for AI-assisted ones, which are never credited
 * as written by a person.
 */
function Credit({ a }: { a: ArticleFull }) {
  const person = a.aiInvolvement === "human" ? a.author : a.aiInvolvement === "auto" ? null : a.editor;
  const text = publicCredit(a.aiInvolvement, a.editor?.name, a.byline);
  const cls = "text-[12.5px] font-medium text-fg-3";
  return person ? (
    <Link href={`/editors/${person.slug}`} className={`${cls} hover:text-fg`}>
      {text}
    </Link>
  ) : (
    <span className={cls}>{text}</span>
  );
}

/** Header + body + provenance of an article (server). The reader chrome wraps it. */
export function ArticleView({ a }: { a: ArticleFull }) {
  const updated = a.updatedAt !== a.publishedAt && new Date(a.updatedAt).getTime() - new Date(a.publishedAt).getTime() > 60_000;
  return (
    <article className="min-w-0" aria-labelledby="article-title">
      <header>
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <BeatChip beat={a.beat} link size="md" />
          {a.isBreaking && <span className="hud text-live">BREAKING</span>}
          {a.story && (
            <Link href={`/s/${a.story.slug}`} className="text-[12.5px] text-fg-3 hover:text-fg">
              스토리 · {a.story.title}
              {a.story.articleCount > 1 ? ` · 업데이트 ${a.story.articleCount}건` : ""} →
            </Link>
          )}
          {a.isSample && <span className="kicker rounded border border-warn/40 px-1.5 !text-[11px] text-warn">샘플</span>}
        </div>
        <h1 id="article-title" className="text-[29px] font-extrabold leading-[1.22] tracking-[-0.035em] text-fg sm:text-[36px]">
          {a.title}
        </h1>
        <div className="mt-5 border-l-2 border-ice/60 pl-4">
          <p className="kicker mb-1.5 text-ice">요약</p>
          <p className="text-[18px] font-medium leading-relaxed text-fg-2 sm:text-[19.5px]">{a.dek}</p>
        </div>
        {/* Two fixed rows: the layout does not reflow when the web font swaps in. */}
        <div className="mt-6 space-y-2.5 border-b border-line pb-5 text-[12.5px] text-fg-3">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span>
              {dateKST(a.publishedAt)} {clockKST(a.publishedAt)}
            </span>
            {updated && (
              <>
                <span aria-hidden="true">·</span>
                <span title={dateTimeKST(a.updatedAt)}>수정 {clockKST(a.updatedAt)}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{readTimeLabel(a.readSeconds)} 읽기</span>
            {/* Reserved at the end of the row: the age appears after hydration without moving anything. */}
            <span className="inline-block min-w-[6em]">
              <LocalTime
                iso={a.publishedAt}
                mode="age"
                prefix={
                  <span aria-hidden="true" className="mr-2.5">
                    ·
                  </span>
                }
              />
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {AI_DISCLOSURE ? <AiBadge value={a.aiInvolvement} editorName={a.editor?.name ?? a.author?.name} variant="long" /> : <Credit a={a} />}
            <CopyLink title={a.title} />
          </div>
        </div>
      </header>

      <div className="mt-8">
        <ArticleBlocks blocks={a.blocks} sentiment={a.sentiment} />
      </div>

      {a.tickers.length > 0 && (
        <div className="mt-10 flex flex-wrap items-center gap-2">
          <span className="kicker text-fg-4">언급 종목</span>
          {a.tickers.map((t) => (
            <span key={t} className="rounded-md border border-line px-2 py-0.5 font-mono text-[12px] text-fg-2">
              {t}
            </span>
          ))}
        </div>
      )}

      <footer className="mt-10 space-y-6 border-t border-line pt-6 text-[13.5px]">
        {a.sources.length > 0 && (
          <section aria-labelledby="sources-h">
            <h2 id="sources-h" className="kicker mb-2.5 text-fg-3">
              출처
            </h2>
            <ul className="space-y-1.5 text-fg-2">
              {a.sources.map((s, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  {s.kind && <span className="kicker shrink-0 rounded border border-line px-1.5 py-[1px] !text-[10.5px] text-fg-3">{SOURCE_KIND[s.kind] ?? s.kind}</span>}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ice hover:underline">
                      {s.name}
                    </a>
                  ) : (
                    <span>{s.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="group rounded-xl border border-line px-4 py-3 open:bg-bg-1">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[13.5px] font-semibold text-fg-2">
            {AI_DISCLOSURE ? "기사 제작 정보" : "기사 정보"}
            <span className="kicker text-fg-4 group-open:hidden">펼치기</span>
          </summary>
          <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-2 text-[13px] text-fg-3">
            {AI_DISCLOSURE && (
              <>
                <dt className="text-fg-4">제작 방식</dt>
                <dd>
                  {AI_LABEL[a.aiInvolvement].long.replace("{editor}", a.editor?.name ?? a.author?.name ?? "편집자")} — {AI_LABEL[a.aiInvolvement].explain}
                </dd>
              </>
            )}
            {(a.editor || a.author) && (
              <>
                <dt className="text-fg-4">책임 편집</dt>
                <dd>
                  {[a.editor, a.author]
                    .filter((p, i, arr) => p && arr.findIndex((q) => q?.slug === p.slug) === i)
                    .map((p) => (
                      <Link key={p!.slug} href={`/editors/${p!.slug}`} className="mr-2 text-ice hover:underline">
                        {p!.name} <span className="text-fg-4">({p!.title})</span>
                      </Link>
                    ))}
                </dd>
              </>
            )}
            {AI_DISCLOSURE && (
              <>
                <dt className="text-fg-4">바이라인</dt>
                <dd>{a.byline}</dd>
              </>
            )}
            <dt className="text-fg-4">1차 출처</dt>
            <dd>{a.sources.length}건</dd>
            <dt className="text-fg-4">버전</dt>
            <dd>
              r{a.revision}
              {a.corrections.length ? ` · 정정 ${a.corrections.length}건` : ""}
            </dd>
          </dl>
          <p className="mt-3 text-[12px] text-fg-4">
            사실과 다른 내용이 있다면{" "}
            <Link href="/policy/corrections" className="text-ice hover:underline">
              정정·반론 보도를 신청
            </Link>
            해 주세요.
          </p>
        </details>

        {a.corrections.length > 0 && (
          <section aria-labelledby="corr-h" className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3">
            <h2 id="corr-h" className="kicker mb-2 text-warn">
              정정 이력
            </h2>
            <ul className="space-y-2 text-[13px] text-fg-2">
              {a.corrections.map((c, i) => (
                <li key={i}>
                  <span className="font-semibold text-fg">[{CORRECTION_KIND[c.kind]}]</span> {c.note}{" "}
                  <span className="text-fg-4">· {dateTimeKST(c.publishedAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {a.tags.length > 0 && (
          <p className="flex flex-wrap gap-1.5">
            {a.tags.map((t) => (
              <span key={t} className="rounded-md bg-bg-2 px-2 py-0.5 text-[12px] text-fg-3">
                #{t}
              </span>
            ))}
          </p>
        )}
      </footer>
    </article>
  );
}

export function StoryTimeline({ slug, storySlug, title, items }: { slug: string; storySlug: string; title: string; items: TimelineEntry[] }) {
  if (items.length < 2) return null;
  return (
    <section aria-labelledby="tl-h">
      <h2 id="tl-h" className="kicker mb-1 text-fg-3">
        스토리 타임라인
      </h2>
      <Link href={`/s/${storySlug}`} className="mb-3 block text-[14px] font-bold leading-snug text-fg hover:text-ice-2">
        {title} →
      </Link>
      <QueueScope ctx={`story:${storySlug}`} label={`스토리 · ${title}`} items={items.map((t) => ({ s: t.slug, t: t.title, b: "" }))}>
        <ol className="relative space-y-3 border-l border-line pl-4">
          {items.slice(0, 8).map((t) => (
            <li key={t.slug} className="relative">
              <span className={`absolute -left-[21px] top-[6px] size-2.5 rounded-full border-2 border-bg ${t.slug === slug ? "bg-ice" : "bg-line-3"}`} aria-hidden="true" />
              <p className="tabular font-mono text-[11px] text-fg-4">
                {dateKST(t.publishedAt)} {clockKST(t.publishedAt)}
              </p>
              {t.slug === slug ? (
                <p className="text-[13px] font-semibold leading-snug text-fg">{t.title}</p>
              ) : (
                <IntentLink href={`/a/${t.slug}`} transitionTypes={["open"]} className="text-[13px] leading-snug text-fg-2 hover:text-fg">
                  {t.title}
                </IntentLink>
              )}
            </li>
          ))}
        </ol>
      </QueueScope>
    </section>
  );
}

export function RelatedList({ items }: { items: ArticleCard[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="rel-h">
      <h2 id="rel-h" className="mb-4 text-[18px] font-bold tracking-[-0.02em] text-fg">
        함께 읽을 기사
      </h2>
      <QueueScope ctx="related" label="함께 읽을 기사" items={items.map((c) => ({ s: c.slug, t: c.title, b: c.beat, r: c.readSeconds }))}>
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((c) => (
            <li key={c.slug} className="group relative rounded-xl border border-line p-4 transition-colors hover:border-line-2 hover:bg-bg-1">
              <p className="mb-1.5 flex items-center gap-2 text-[11.5px]">
                <BeatChip beat={c.beat} />
                <span className="text-fg-4">{readTimeLabel(c.readSeconds)}</span>
              </p>
              <IntentLink href={`/a/${c.slug}`} transitionTypes={["open"]} className="text-[15px] font-bold leading-snug text-fg after:absolute after:inset-0 group-hover:text-ice-2">
                {c.title}
              </IntentLink>
            </li>
          ))}
        </ul>
      </QueueScope>
    </section>
  );
}

export function beatPathOf(a: Pick<ArticleFull, "beat">) {
  return BEATS[a.beat].path;
}
