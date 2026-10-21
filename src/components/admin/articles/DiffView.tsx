import { cx } from "@/components/admin/ui";
import type { Row, Seg } from "./diff";

/**
 * Side-by-side diff of one field (title, dek, body). Removed text is marked
 * with "−" and a red wash, added text with "+" and a green wash, so colour is
 * never the only cue. Below `sm` unchanged lines show once.
 */

function Segs({ segs, side }: { segs: Seg[]; side: "left" | "right" }) {
  return (
    <>
      {segs.map((s, i) =>
        s.changed ? (
          side === "left" ? (
            <del key={i} className="rounded-[3px] bg-bad/25 px-px text-fg no-underline">
              {s.text}
            </del>
          ) : (
            <ins key={i} className="rounded-[3px] bg-good/25 px-px text-fg no-underline">
              {s.text}
            </ins>
          )
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Cell({ row, side }: { row: Row; side: "left" | "right" }) {
  const segs = side === "left" ? row.left : row.right;
  if (!segs) return <div className="hidden rounded-md bg-bg-2/40 sm:block" aria-hidden="true" />;
  const changed = row.kind !== "same";
  const tint = !changed ? "text-fg-3" : side === "left" ? "bg-bad/[0.07] text-fg-2" : "bg-good/[0.07] text-fg-2";
  return (
    <div
      className={cx(
        "relative min-w-0 rounded-md py-1.5 pl-6 pr-2.5 text-[13px] leading-relaxed [overflow-wrap:anywhere]",
        tint,
        !changed && side === "right" && "hidden sm:block",
      )}
    >
      <span
        className={cx("absolute left-2 top-1.5 font-mono text-[12px] font-bold", !changed ? "text-fg-4" : side === "left" ? "text-bad" : "text-good")}
        aria-hidden="true"
      >
        {!changed ? " " : side === "left" ? "−" : "+"}
      </span>
      {changed && <span className="sr-only">{side === "left" ? "삭제: " : "추가: "}</span>}
      <Segs segs={segs} side={side} />
    </div>
  );
}

function Pair({ row }: { row: Row }) {
  return (
    <>
      <Cell row={row} side="left" />
      <Cell row={row} side="right" />
    </>
  );
}

/** Collapse long runs of unchanged lines, keeping one line of context on each side. */
function fold(rows: Row[]): Array<Row | { fold: number }> {
  const out: Array<Row | { fold: number }> = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].kind !== "same") {
      out.push(rows[i++]);
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].kind === "same") j++;
    const run = rows.slice(i, j);
    const keepHead = i > 0 ? 1 : 0;
    const keepTail = j < rows.length ? 1 : 0;
    if (run.length > keepHead + keepTail + 1) {
      out.push(...run.slice(0, keepHead), { fold: run.length - keepHead - keepTail }, ...run.slice(run.length - keepTail));
    } else out.push(...run);
    i = j;
  }
  return out;
}

export function DiffField({ label, rows, leftLabel, rightLabel }: { label: string; rows: Row[]; leftLabel: string; rightLabel: string }) {
  const changed = rows.some((r) => r.kind !== "same");
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="kicker text-fg-2">{label}</h3>
        {!changed && <span className="text-[11.5px] text-fg-4">변경 없음</span>}
      </div>
      {changed ? (
        <>
          <div className="mb-1 hidden grid-cols-2 gap-1.5 sm:grid" aria-hidden="true">
            <span className="hud normal-case text-fg-4">{leftLabel}</span>
            <span className="hud normal-case text-fg-4">{rightLabel}</span>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-x-1.5">
            {fold(rows).map((r, i) =>
              "fold" in r ? (
                <p key={i} className="col-span-full flex items-center gap-2 py-0.5 text-[11.5px] text-fg-4">
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  변경 없는 블록 {r.fold}개
                  <span className="h-px flex-1 bg-line" aria-hidden="true" />
                </p>
              ) : (
                <Pair key={i} row={r} />
              ),
            )}
          </div>
        </>
      ) : (
        <p className="rounded-md px-2.5 py-1.5 text-[13px] leading-relaxed text-fg-3 [overflow-wrap:anywhere]">
          {rows.length === 1 ? rows[0].left?.[0]?.text : `${rows.length}개 블록 모두 동일`}
        </p>
      )}
    </section>
  );
}
