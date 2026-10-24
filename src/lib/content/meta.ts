/**
 * Zod-free content helpers and labels — safe to import from client components
 * (the schemas in ./blocks pull zod into the bundle).
 */
import type { Block } from "./blocks";

export const SECTION_LABELS = [
  "big_picture",
  "between_lines",
  "yes_but",
  "zoom_in",
  "context",
  "view_from",
  "disagreement",
  "bottom_line",
] as const;
export type SectionLabel = (typeof SECTION_LABELS)[number];

export const SECTION_LABEL_KO: Record<SectionLabel, string> = {
  big_picture: "넓게 보면",
  between_lines: "행간",
  yes_but: "짚어볼 점",
  zoom_in: "자세히 보면",
  context: "맥락",
  view_from: "현장의 시각",
  disagreement: "다른 시각",
  bottom_line: "결론",
};

export const BLOCK_TITLE_KO = {
  signal: "요약",
  why: "왜 중요한가",
  numbers: "숫자로 보면",
  sentiment: "투자자 심리",
  next: "다음 관전 포인트",
  deeper: "더 깊이",
  chart: "차트",
  table: "표",
} as const;

/** Plain text of a block, for reading time, search and duplicate checks. */
export function blockText(b: Block): string {
  switch (b.type) {
    case "why":
    case "next":
      return b.items.join(" ");
    case "numbers":
      return b.items.map((n) => `${n.value} ${n.label}`).join(" ");
    case "section":
      return [b.text ?? "", ...(b.bullets ?? [])].join(" ");
    case "quote":
      return b.text;
    case "chart":
      return b.title;
    case "table":
      return [b.caption, ...b.rows.flat()].join(" ");
    case "deeper":
      return b.links.map((l) => l.title).join(" ");
    case "sentiment":
      return "";
  }
}

export function plainText(title: string, dek: string, blocks: Block[]): string {
  return [title, dek, ...blocks.map(blockText)].join(" ").replace(/\*\*/g, "");
}

/** Korean reading speed ≈ 9.5 chars/sec (≈ 570 cpm), excluding whitespace. */
export function readSecondsFor(title: string, dek: string, blocks: Block[]): number {
  const chars = plainText(title, dek, blocks).replace(/\s+/g, "").length;
  return Math.max(15, Math.round(chars / 9.5));
}

export function readTimeLabel(seconds: number): string {
  if (seconds < 60) return `${Math.max(10, Math.round(seconds / 10) * 10)}초`;
  return `${Math.round(seconds / 60)}분`;
}
