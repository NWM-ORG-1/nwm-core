import type { z } from "zod";
import type { Block } from "@/lib/content/blocks";
import { SECTION_LABEL_KO } from "@/lib/content/meta";
import { BLOCK_LABEL_KO } from "./shared";

/**
 * Turns draftSchema issues into short Korean messages tied to a field, so the
 * editor can show them next to the input that caused them.
 */

export interface FieldIssue {
  path: PropertyKey[];
  /** "1행 값", "항목 2" … relative to the block or field */
  where: string;
  message: string;
}

const FIELD_KO: Record<string, string> = {
  title: "제목",
  dek: "시그널",
  blocks: "본문 블록",
  items: "항목",
  value: "값",
  label: "라벨",
  delta: "변화",
  trend: "추세",
  text: "본문",
  bullets: "불릿",
  attribution: "발언자",
  role: "직함",
  unit: "단위",
  points: "데이터",
  source: "출처",
  caption: "캡션",
  columns: "열",
  rows: "행",
  links: "링크",
  href: "주소",
  kind: "종류",
  tags: "태그",
  tickers: "종목",
  sources: "출처",
  name: "이름",
  url: "URL",
};

type Issue = z.core.$ZodIssue;

export function issueMessage(i: Issue): string {
  switch (i.code) {
    case "too_small":
      if (i.origin === "string") return Number(i.minimum) <= 1 ? "비어 있습니다" : `${i.minimum}자 이상 필요합니다`;
      if (i.origin === "array") return Number(i.minimum) <= 1 ? "1개 이상 필요합니다" : `${i.minimum}개 이상 필요합니다`;
      return `${i.minimum} 이상이어야 합니다`;
    case "too_big":
      if (i.origin === "string") return `${i.maximum}자 이하로 줄이세요`;
      if (i.origin === "array") return `최대 ${i.maximum}개까지입니다`;
      return `${i.maximum} 이하여야 합니다`;
    case "invalid_type":
      return i.expected === "number" ? "숫자가 아닙니다" : "형식이 올바르지 않습니다";
    case "invalid_value":
    case "invalid_union":
      return "허용되지 않는 값입니다";
    default:
      return /[가-힣]/.test(i.message) ? i.message : "형식이 올바르지 않습니다";
  }
}

/** "1행 값", "항목 2", "링크 1 종류" — path relative to a block or field. */
export function whereOf(rel: PropertyKey[]): string {
  const out: string[] = [];
  for (let k = 0; k < rel.length; k++) {
    const p = rel[k];
    if (typeof p === "number") {
      const prev = rel[k - 1];
      if (prev === "rows" && typeof rel[k + 1] === "number") {
        out[out.length - 1] = `${p + 1}행`;
        continue;
      }
      if (typeof prev === "number" && rel[k - 2] === "rows") {
        out.push(`${p + 1}열`);
        continue;
      }
      if (out.length && (prev === "items" || prev === "points" || prev === "links" || prev === "columns" || prev === "rows" || prev === "bullets" || prev === "tags" || prev === "tickers" || prev === "sources")) {
        out[out.length - 1] = `${out[out.length - 1]} ${p + 1}`;
      } else out.push(`${p + 1}`);
    } else out.push(FIELD_KO[String(p)] ?? String(p));
  }
  return out.join(" ");
}

export function collectIssues(error: z.ZodError | undefined): FieldIssue[] {
  if (!error) return [];
  return error.issues.map((i) => ({ path: i.path, where: whereOf(i.path), message: issueMessage(i) }));
}

/** Issues under a path prefix, with `where` rewritten relative to it. */
export function issuesUnder(all: FieldIssue[], prefix: PropertyKey[]): FieldIssue[] {
  return all
    .filter((i) => prefix.every((p, k) => i.path[k] === p))
    .map((i) => ({ ...i, where: whereOf(i.path.slice(prefix.length)) }));
}

export function blockTitle(b: Block): string {
  return b.type === "section" ? SECTION_LABEL_KO[b.label] ?? BLOCK_LABEL_KO.section : BLOCK_LABEL_KO[b.type];
}
