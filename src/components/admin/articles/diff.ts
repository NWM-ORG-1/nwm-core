/**
 * Minimal line / word diff (LCS) for comparing article revisions, plus the
 * plain-text projection of an article the diff runs on. Pure; no deps.
 */
import type { Block } from "@/lib/content/blocks";
import { BLOCK_TITLE_KO, SECTION_LABEL_KO, blockText } from "@/lib/content/meta";

export type Op<T = string> = { type: "same" | "add" | "del"; value: T };

/** Longest-common-subsequence edit script from `a` to `b`. */
export function diff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean = (x, y) => x === y): Op<T>[] {
  const n = a.length;
  const m = b.length;
  // Guard against pathological inputs: fall back to "all removed, all added".
  if (n * m > 400_000) return [...a.map((value) => ({ type: "del" as const, value })), ...b.map((value) => ({ type: "add" as const, value }))];
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push({ type: "same", value: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", value: a[i++] });
    } else {
      out.push({ type: "add", value: b[j++] });
    }
  }
  while (i < n) out.push({ type: "del", value: a[i++] });
  while (j < m) out.push({ type: "add", value: b[j++] });
  return out;
}

export interface Seg {
  text: string;
  changed: boolean;
}

/** Word-level highlight for a changed line pair (whitespace kept as tokens). */
export function wordDiff(a: string, b: string): { left: Seg[]; right: Seg[] } {
  const ta = a.split(/(\s+)/).filter(Boolean);
  const tb = b.split(/(\s+)/).filter(Boolean);
  const left: Seg[] = [];
  const right: Seg[] = [];
  const push = (arr: Seg[], text: string, changed: boolean) => {
    const prev = arr[arr.length - 1];
    if (prev && prev.changed === changed) prev.text += text;
    else arr.push({ text, changed });
  };
  for (const op of diff(ta, tb)) {
    const ws = /^\s+$/.test(op.value);
    if (op.type === "same") {
      push(left, op.value, false);
      push(right, op.value, false);
    } else if (op.type === "del") push(left, op.value, !ws);
    else push(right, op.value, !ws);
  }
  return { left, right };
}

export interface Row {
  kind: "same" | "change" | "del" | "add";
  left: Seg[] | null;
  right: Seg[] | null;
}

/** Side-by-side rows: runs of removed + added lines are paired up and word-diffed. */
export function sideBySide(a: string[], b: string[]): Row[] {
  const ops = diff(a, b);
  const rows: Row[] = [];
  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.type === "same") {
      rows.push({ kind: "same", left: [{ text: op.value, changed: false }], right: [{ text: op.value, changed: false }] });
      k++;
      continue;
    }
    const dels: string[] = [];
    const adds: string[] = [];
    while (k < ops.length && ops[k].type !== "same") {
      if (ops[k].type === "del") dels.push(ops[k].value);
      else adds.push(ops[k].value);
      k++;
    }
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      const l = dels[i];
      const r = adds[i];
      if (l != null && r != null) {
        const w = wordDiff(l, r);
        rows.push({ kind: "change", left: w.left, right: w.right });
      } else if (l != null) rows.push({ kind: "del", left: [{ text: l, changed: true }], right: null });
      else rows.push({ kind: "add", left: null, right: [{ text: r!, changed: true }] });
    }
  }
  return rows;
}

export function stats(rows: Row[]) {
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.kind === "add") added++;
    else if (r.kind === "del") removed++;
    else if (r.kind === "change") {
      added++;
      removed++;
    }
  }
  return { added, removed };
}

const EXTRA_TITLE: Record<string, string> = { quote: "인용" };

export function blockLabel(b: Block): string {
  if (b.type === "section") return SECTION_LABEL_KO[b.label] ?? b.label;
  return (BLOCK_TITLE_KO as Record<string, string>)[b.type] ?? EXTRA_TITLE[b.type] ?? b.type;
}

/** One plain-text line per block, prefixed with its Korean label. */
export function bodyLines(blocks: Block[]): string[] {
  return blocks.map((b) => {
    const t = blockText(b).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    // Fields blockText() leaves out, so a changed figure still shows up in the diff.
    const extra =
      b.type === "quote"
        ? ` — ${b.attribution}${b.role ? `, ${b.role}` : ""}`
        : b.type === "chart"
          ? ` (${b.points.length}개 지점 · ${b.points[0]} → ${b.points[b.points.length - 1]}${b.unit ?? ""})`
          : b.type === "numbers"
            ? b.items.some((n) => n.delta)
              ? ` (${b.items.map((n) => n.delta ?? "—").join(" / ")})`
              : ""
            : "";
    return `[${blockLabel(b)}] ${t}${extra}`.trim();
  });
}
