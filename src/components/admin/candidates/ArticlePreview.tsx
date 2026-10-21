import type { AiInvolvement, Beat } from "@/db/schema";
import type { Block, SentimentSnapshot, SourceRef } from "@/lib/content/blocks";
import { readSecondsFor, readTimeLabel } from "@/lib/content/meta";
import { AI_LABEL, aiLabelLong } from "@/lib/labels";
import { ArticleBlocks } from "@/components/article/ArticleBlocks";
import { BeatChip } from "@/components/ui/BeatChip";
import { cx } from "@/components/admin/ui";
import { SOURCE_KIND_KO } from "./shared";

/**
 * The public article (header, body, provenance) rendered from a draft, with the
 * same markup and classes as components/article/ArticleView. Hook-free, so the
 * editor (client) and the preview page (server) share it.
 *
 * `device` pins the responsive type scale: "mobile" renders the phone sizes
 * even on a wide admin screen, "desktop" the ≥640px sizes, "responsive" follows
 * the viewport exactly like the public page.
 */

export type PreviewDevice = "mobile" | "desktop" | "responsive";

// ArticleBlocks styles itself with viewport media queries (prose size, grids);
// inside a device frame those are pinned to the frame's breakpoint instead.
const DEVICE_CSS = `
[data-nwm-device="mobile"] .prose-nwm{font-size:17px}
[data-nwm-device="mobile"] .prose-nwm .sm\\:grid-cols-3{grid-template-columns:repeat(2,minmax(0,1fr))}
[data-nwm-device="mobile"] .prose-nwm .sm\\:grid-cols-2{grid-template-columns:minmax(0,1fr)}
[data-nwm-device="desktop"] .prose-nwm{font-size:18px}
[data-nwm-device="desktop"] .prose-nwm .sm\\:grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
[data-nwm-device="desktop"] .prose-nwm .sm\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
`;

export interface PreviewArticle {
  title: string;
  dek: string;
  blocks: Block[];
  sentiment?: SentimentSnapshot | null;
  beat: Beat;
  isBreaking?: boolean;
  storyTitle?: string | null;
  ai: AiInvolvement;
  editorName: string;
  byline: string;
  tickers: string[];
  tags: string[];
  sources: SourceRef[];
  /** blocks left out because they are still invalid */
  skipped?: number;
}

export function ArticlePreview({ a, device = "responsive" }: { a: PreviewArticle; device?: PreviewDevice }) {
  const m = device === "mobile";
  const d = device === "desktop";
  const secs = readSecondsFor(a.title, a.dek, a.blocks);
  const machine = a.ai !== "human";
  return (
    <article className="min-w-0" data-nwm-device={device === "responsive" ? undefined : device} aria-label="기사 미리보기">
      {device !== "responsive" && <style>{DEVICE_CSS}</style>}
      <header>
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <BeatChip beat={a.beat} size="md" />
          {a.isBreaking && <span className="hud text-live">BREAKING</span>}
          {a.storyTitle && <span className="text-[12.5px] text-fg-3">스토리 · {a.storyTitle} →</span>}
        </div>
        <h1
          className={cx(
            "font-extrabold leading-[1.22] tracking-[-0.035em]",
            d ? "text-[36px]" : m ? "text-[29px]" : "text-[29px] sm:text-[36px]",
            a.title.trim() ? "text-fg" : "text-fg-4",
          )}
        >
          {a.title.trim() || "제목을 입력하세요"}
        </h1>
        <div className="mt-5 border-l-2 border-ice/60 pl-4">
          <p className="kicker mb-1.5 text-ice">시그널</p>
          <p className={cx("font-medium leading-relaxed", d ? "text-[19.5px]" : m ? "text-[18px]" : "text-[18px] sm:text-[19.5px]", a.dek.trim() ? "text-fg-2" : "text-fg-4")}>
            {a.dek.trim() || "시그널(1–2문장 요약)을 입력하세요"}
          </p>
        </div>
        <div className="mt-6 space-y-2.5 border-b border-line pb-5 text-[12.5px] text-fg-3">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span>발행 시각</span>
            <span aria-hidden="true">·</span>
            <span>{readTimeLabel(secs)} 읽기</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span title={AI_LABEL[a.ai].explain} className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-2 py-[3px] text-[11px] font-medium text-fg-3">
              <span className={`hud !text-[9px] !tracking-[0.12em] ${machine ? "text-ice" : "text-fg-3"}`} aria-hidden="true">
                {machine ? "AI" : "HUMAN"}
              </span>
              <span>{aiLabelLong(a.ai, a.editorName)}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="mt-8">
        {a.skipped ? (
          <p className="mb-6 rounded-lg border border-dashed border-warn/40 px-3 py-2 text-[12px] text-warn">작성 중인 블록 {a.skipped}개는 입력을 마칠 때까지 미리보기에서 생략됩니다.</p>
        ) : null}
        {a.blocks.length ? (
          <ArticleBlocks blocks={a.blocks} sentiment={a.sentiment} />
        ) : (
          <p className="rounded-xl border border-dashed border-line-2 px-4 py-8 text-center text-[13px] text-fg-4">본문 블록이 없습니다</p>
        )}
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
          <section>
            <h2 className="kicker mb-2.5 text-fg-3">출처</h2>
            <ul className="space-y-1.5 text-fg-2">
              {a.sources.map((s, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  {s.kind && <span className="kicker shrink-0 rounded border border-line px-1.5 py-[1px] !text-[10.5px] text-fg-3">{SOURCE_KIND_KO[s.kind] ?? s.kind}</span>}
                  {s.url ? <span className="text-ice">{s.name}</span> : <span>{s.name}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="rounded-xl border border-line bg-bg-1 px-4 py-3">
          <p className="text-[13.5px] font-semibold text-fg-2">이 기사는 이렇게 만들어졌습니다</p>
          <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-2 text-[13px] text-fg-3">
            <dt className="text-fg-4">제작 방식</dt>
            <dd>
              {aiLabelLong(a.ai, a.editorName)} — {AI_LABEL[a.ai].explain}
            </dd>
            {a.ai !== "auto" && (
              <>
                <dt className="text-fg-4">책임 편집</dt>
                <dd className="text-ice">{a.editorName}</dd>
              </>
            )}
            <dt className="text-fg-4">바이라인</dt>
            <dd>{a.byline}</dd>
            <dt className="text-fg-4">1차 출처</dt>
            <dd>{a.sources.length}건</dd>
            <dt className="text-fg-4">버전</dt>
            <dd>r1</dd>
          </dl>
        </div>
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
