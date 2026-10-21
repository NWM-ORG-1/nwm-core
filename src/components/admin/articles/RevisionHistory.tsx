"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { Block } from "@/lib/content/blocks";
import { Badge, btn, cx } from "@/components/admin/ui";
import { DiffField } from "./DiffView";
import { bodyLines, sideBySide, stats } from "./diff";
import { CORRECTION_KIND_LABEL, dateTimeKST, shortDateTime, type CorrectionKind } from "./labels";

export interface RevisionItem {
  revision: number;
  title: string;
  dek: string;
  blocks: Block[];
  reason: string;
  editor: string | null;
  createdAt: string;
}

const select =
  "h-8 rounded-lg border border-line-2 bg-bg-1 px-2 font-mono text-[12.5px] text-fg transition-colors hover:border-line-3 focus:border-ice focus:outline-none focus-visible:outline-none focus:shadow-[0_0_0_3px_var(--ice-glow)]";

/** Revision list with a two-way compare (title, dek, body text). */
export function RevisionHistory({
  revisions,
  corrections,
  current,
}: {
  revisions: RevisionItem[];
  corrections: Array<{ revision: number; kind: CorrectionKind }>;
  current: number;
}) {
  const sorted = useMemo(() => [...revisions].sort((x, y) => y.revision - x.revision), [revisions]);
  const [pair, setPair] = useState<{ a: number; b: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const byRev = useMemo(() => new Map(sorted.map((r) => [r.revision, r])), [sorted]);
  const corrByRev = useMemo(() => new Map(corrections.map((c) => [c.revision, c.kind])), [corrections]);

  const open = (a: number, b: number) => {
    setPair({ a: Math.min(a, b), b: Math.max(a, b) });
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      }),
    );
  };

  const A = pair ? byRev.get(pair.a) : undefined;
  const B = pair ? byRev.get(pair.b) : undefined;
  const diffs = useMemo(() => {
    if (!A || !B) return null;
    const title = sideBySide([A.title], [B.title]);
    const dek = sideBySide([A.dek], [B.dek]);
    const body = sideBySide(bodyLines(A.blocks), bodyLines(B.blocks));
    const s = [title, dek, body].map(stats).reduce((x, y) => ({
      added: x.added + y.added,
      removed: x.removed + y.removed,
    }));
    return { title, dek, body, ...s };
  }, [A, B]);

  if (!sorted.length) {
    return <p className="py-4 text-center text-[13px] text-fg-3">저장된 버전이 없습니다.</p>;
  }

  return (
    <div>
      <ol className="divide-y divide-line">
        {sorted.map((r, i) => {
          const prev = sorted[i + 1];
          const corr = corrByRev.get(r.revision);
          return (
            <li key={r.revision} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
              <span className="tabular mt-px w-8 shrink-0 font-mono text-[13px] font-bold text-fg">r{r.revision}</span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[13px] leading-snug text-fg-2">
                  {r.reason || <span className="text-fg-4">{r.revision === 1 ? "최초 발행" : "사유 없음"}</span>}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-3">
                  <span>{r.editor ?? "시스템"}</span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={r.createdAt} title={dateTimeKST(r.createdAt)} className="tabular font-mono">
                    {shortDateTime(r.createdAt)}
                  </time>
                  {r.revision === current && <Badge tone="ice">현재</Badge>}
                  {corr && <Badge tone="warn">{CORRECTION_KIND_LABEL[corr]}</Badge>}
                </p>
              </div>
              {prev && (
                <button
                  type="button"
                  onClick={() => open(prev.revision, r.revision)}
                  aria-pressed={pair?.a === prev.revision && pair?.b === r.revision}
                  className={cx(btn.base, btn.quiet, "h-7 px-2 text-[12px] aria-pressed:bg-bg-3 aria-pressed:text-fg")}
                  aria-label={`r${prev.revision}과 r${r.revision} 비교`}
                >
                  r{prev.revision}↔r{r.revision} 비교
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {sorted.length < 2 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line-2 px-3 py-2.5 text-[12.5px] text-fg-3">
          비교할 이전 버전이 없습니다. 수정·정정을 게시하면 새 버전이 쌓입니다.
        </p>
      ) : (
        <div ref={panelRef} className="mt-4 scroll-mt-20 rounded-xl border border-line bg-bg-1/50">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="kicker mr-1 text-fg-2">비교</span>
            <label htmlFor={`${uid}-a`} className="sr-only">
              기준 버전
            </label>
            <select id={`${uid}-a`} className={select} value={pair?.a ?? ""} onChange={(e) => open(Number(e.target.value), pair?.b ?? sorted[0].revision)}>
              <option value="" disabled>
                기준
              </option>
              {sorted.map((r) => (
                <option key={r.revision} value={r.revision}>
                  r{r.revision}
                </option>
              ))}
            </select>
            <span className="text-fg-4" aria-hidden="true">
              →
            </span>
            <label htmlFor={`${uid}-b`} className="sr-only">
              비교 버전
            </label>
            <select
              id={`${uid}-b`}
              className={select}
              value={pair?.b ?? ""}
              onChange={(e) => open(pair?.a ?? sorted[sorted.length - 1].revision, Number(e.target.value))}
            >
              <option value="" disabled>
                비교
              </option>
              {sorted.map((r) => (
                <option key={r.revision} value={r.revision}>
                  r{r.revision}
                </option>
              ))}
            </select>
            {!pair && (
              <button type="button" className={cx(btn.base, btn.ghost, "h-8")} onClick={() => open(sorted[1].revision, sorted[0].revision)}>
                최근 변경 보기
              </button>
            )}
            {diffs && (
              <span className="tabular ml-auto flex items-center gap-2 font-mono text-[12px]">
                <span className="text-good">+{diffs.added}</span>
                <span className="text-bad">−{diffs.removed}</span>
                <button type="button" onClick={() => setPair(null)} className={cx(btn.base, btn.quiet, "h-7 px-2 font-sans text-[12px]")}>
                  닫기
                </button>
              </span>
            )}
          </div>
          {diffs && A && B ? (
            <div className="space-y-4 p-3" aria-live="polite">
              {pair!.a === pair!.b ? (
                <p className="text-[12.5px] text-fg-3">같은 버전입니다. 다른 버전을 고르세요.</p>
              ) : (
                <>
                  <DiffField label="제목" rows={diffs.title} leftLabel={`r${A.revision}`} rightLabel={`r${B.revision}`} />
                  <DiffField label="시그널" rows={diffs.dek} leftLabel={`r${A.revision}`} rightLabel={`r${B.revision}`} />
                  <DiffField label="본문" rows={diffs.body} leftLabel={`r${A.revision}`} rightLabel={`r${B.revision}`} />
                </>
              )}
            </div>
          ) : (
            <p className="px-3 py-3 text-[12.5px] text-fg-3">두 버전을 고르면 제목·시그널·본문을 나란히 비교합니다. 바뀐 단어는 강조됩니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
