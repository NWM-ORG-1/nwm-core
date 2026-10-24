import { createHash } from "node:crypto";
import type { Draft } from "@/lib/content/blocks";
import { plainText } from "@/lib/content/blocks";
import type { CandidateMode, CheckId, CheckResult } from "@/db/schema";
import { payloadBody } from "@/ingest/body";
import { AI_DISCLOSURE } from "@/lib/labels";

/**
 * Deterministic pre-publish checks. Blocking checks must pass (or be overridden
 * with a logged reason) before a candidate can be published.
 */

export interface CheckItem {
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  signalOnly: boolean;
  trustTier: number;
  sourceName: string;
  lic: { commercialOk: boolean | null; verbatimOk: boolean | null; reviewed: boolean };
}

export const CHECK_META: Record<CheckId, { label: string; blocking: boolean }> = {
  format: { label: "형식 (제목·요약·본문)", blocking: true },
  sources: { label: "1차 출처", blocking: true },
  license: { label: "라이선스·인용 범위", blocking: true },
  ai_label: { label: AI_DISCLOSURE ? "AI 표기·책임 편집자" : "책임 편집자", blocking: true },
  legal: { label: "법률 검토 (명예훼손·저작권)", blocking: true },
  numbers: { label: "수치 원문 대조", blocking: false },
  brevity: { label: "간결성", blocking: false },
  duplicate: { label: "중복 기사", blocking: false },
};

const PRIMARY_KINDS = new Set(["filing", "press", "data", "report", "paper"]);

/** Stable fingerprint of a draft — the legal sign-off is only valid for this exact text. */
export function draftHash(d: Draft): string {
  return createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 16);
}

/** Leaf values of a feed payload, skipping identifier-like strings (receipt numbers, CIKs …). */
function payloadLeaves(v: unknown): string[] {
  if (v == null) return [];
  if (typeof v === "number") return [String(v)];
  if (typeof v === "string") return /^\d{8,}$|^\d{4}\.\d{4,}/.test(v) ? [] : [v];
  if (Array.isArray(v)) return v.flatMap(payloadLeaves);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).flatMap(payloadLeaves);
  return [];
}

function sentences(t: string) {
  return t.split(/(?<=[.!?。])\s+|(?<=다\.)\s*/).filter((s) => s.trim().length > 0);
}

function bigrams(s: string) {
  const t = s.replace(/\s+/g, "").toLowerCase();
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

export function similarity(a: string, b: string) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Longest run of `n` consecutive (non-space) characters shared with `src`. */
function copiesRun(text: string, src: string, n: number) {
  const t = text.replace(/\s+/g, "");
  const s = src.replace(/\s+/g, "");
  if (s.length < n) return false;
  for (let i = 0; i + n <= s.length; i += 3) {
    if (t.includes(s.slice(i, i + n))) return true;
  }
  return false;
}

const NUM_TOKEN = /\d[\d,]*(?:\.\d+)?/g;

/**
 * Numbers in the draft (text and key-number deltas) that appear nowhere in the
 * source items — titles, summaries or payload values. Chart series are data and
 * are checked by eye.
 */
export function numbersNotInSources(draft: Draft, items: Array<Pick<CheckItem, "title" | "summary" | "payload">>): string[] {
  const haystack = items
    .map((i) => [i.title, i.summary, ...payloadLeaves(i.payload)].join(" "))
    .join(" ")
    .replace(/(\d),(?=\d)/g, "$1");
  const text = plainText(draft.title, draft.dek, draft.blocks);
  const checked = [text, ...draft.blocks.flatMap((b) => (b.type === "numbers" ? b.items.map((n) => n.delta ?? "") : []))].join(" ");
  const nums = [...new Set((checked.match(NUM_TOKEN) ?? []).map((n) => n.replace(/,/g, "")))];
  const has = (n: string) => new RegExp(`(?<![\\d.])${n.replace(/\./g, "\\.")}(?!\\d)`).test(haystack);
  return nums.filter((n) => !has(n));
}

export function runChecks(input: {
  draft: Draft;
  mode: CandidateMode;
  items: CheckItem[];
  recentTitles: string[];
  previous: CheckResult[];
  editorName: string | null;
}): CheckResult[] {
  const { draft, mode, items } = input;
  const prev = new Map(input.previous.map((c) => [c.id, c]));
  const text = plainText(draft.title, draft.dek, draft.blocks);
  const usable = items.filter((i) => !i.signalOnly);
  const out: CheckResult[] = [];

  const push = (id: CheckId, ok: boolean, message: string) => {
    const p = prev.get(id);
    const overridden = !ok && p?.overridden ? p.overridden : undefined;
    out.push({ id, ok, blocking: CHECK_META[id].blocking, message, ...(overridden ? { overridden } : {}) });
  };

  // format
  const missing = [!draft.title.trim() && "제목", !draft.dek.trim() && "요약", draft.blocks.length === 0 && "본문 블록"].filter(Boolean);
  push("format", missing.length === 0, missing.length ? `${missing.join(", ")} 필요` : "제목·요약·본문 블록 확인");

  // sources
  const primaryItem = usable.some((i) => i.trustTier <= 2);
  // refs that merely echo a linked community/unverified source never count as primary
  const lowTier = new Set(items.filter((i) => i.trustTier >= 3 || i.signalOnly).map((i) => i.sourceName));
  const primaryRef = draft.sources.some((s) => s.kind && PRIMARY_KINDS.has(s.kind) && !lowTier.has(s.name));
  const srcOk = mode === "data_auto" ? draft.sources.length > 0 : primaryItem || primaryRef;
  push(
    "sources",
    srcOk,
    srcOk ? "신뢰 등급 1–2 또는 1차 자료 출처 확인" : "신뢰 등급 1–2 소스나 공시·보도자료·데이터 같은 1차 출처가 필요합니다",
  );

  // license
  const problems: string[] = [];
  for (const i of items) {
    if (i.signalOnly) {
      if (copiesRun(text, `${i.title} ${i.summary}`, 20)) problems.push(`신호 전용 소스(${i.sourceName}) 문장 사용`);
      continue;
    }
    if (!i.lic.reviewed) problems.push(`라이선스 미검토: ${i.sourceName}`);
    else if (i.lic.commercialOk === false) problems.push(`상업적 이용 불가: ${i.sourceName}`);
    if (i.lic.verbatimOk === false && copiesRun(text, `${i.summary} ${payloadBody(i.payload)}`, 30)) problems.push(`원문 30자 이상 연속 인용: ${i.sourceName}`);
  }
  push("license", problems.length === 0, problems.length ? [...new Set(problems)].join(" · ") : "모든 소스 이용 범위 내");

  // ai label
  const needsEditor = mode !== "data_auto";
  const labelOk = !needsEditor || Boolean(input.editorName);
  push(
    "ai_label",
    labelOk,
    mode === "data_auto"
      ? AI_DISCLOSURE
        ? "‘자동 생성 · 데이터 기반’으로 표기됩니다"
        : "‘NWM 데이터 데스크’ 이름으로 나갑니다"
      : labelOk
        ? AI_DISCLOSURE
          ? `책임 편집자 ${input.editorName} — 기사에 AI 표기와 함께 노출됩니다`
          : `책임 편집자 ${input.editorName} — 기사에 편집자로 표시됩니다`
        : "책임 편집자가 필요합니다",
  );

  // legal — manual confirmation, valid only for the exact draft it was given for
  const legal = prev.get("legal");
  const hash = draftHash(draft);
  const legalValid = Boolean(legal?.ok && legal.draftHash === hash);
  push(
    "legal",
    legalValid,
    legalValid ? legal!.message : legal?.ok ? "확인 이후 초안이 바뀌었습니다 — 다시 확인하세요" : "편집자가 직접 확인해야 합니다",
  );
  if (legalValid) out[out.length - 1].draftHash = hash;

  // numbers
  if (mode === "data_auto") {
    push("numbers", true, "데이터 템플릿 — 수치는 원천 데이터에서 자동 입력");
  } else {
    const unmatched = numbersNotInSources(draft, items);
    push(
      "numbers",
      unmatched.length === 0,
      unmatched.length ? `원문에서 찾지 못한 수치 ${unmatched.length}건: ${unmatched.slice(0, 5).join(", ")}` : "본문 수치가 원천 자료와 일치",
    );
  }

  // brevity
  const issues: string[] = [];
  if (draft.title.length > 45) issues.push(`제목 ${draft.title.length}자 (권장 ≤45)`);
  if (sentences(draft.dek).length > 2 || draft.dek.length > 120) issues.push("요약은 1–2문장");
  for (const b of draft.blocks) {
    if (b.type === "section" && b.text && sentences(b.text).length > 3) issues.push("3문장 넘는 단락");
    if (b.type === "why" && b.items.length > 3) issues.push("왜 중요한가 3개 초과");
  }
  if (draft.blocks.length > 8) issues.push(`블록 ${draft.blocks.length}개 (권장 ≤8)`);
  push("brevity", issues.length === 0, issues.length ? [...new Set(issues)].join(" · ") : "간결함");

  // duplicate
  const best = input.recentTitles.reduce(
    (acc, t) => {
      const s = similarity(draft.title, t);
      return s > acc.s ? { s, t } : acc;
    },
    { s: 0, t: "" },
  );
  push(
    "duplicate",
    best.s < 0.55,
    best.s >= 0.55 ? `72시간 내 유사 기사: “${best.t}” (유사도 ${(best.s * 100).toFixed(0)}%)` : "72시간 내 유사 기사 없음",
  );

  return out;
}

export function blockingFailures(checks: CheckResult[]) {
  return checks.filter((c) => c.blocking && !c.ok && !c.overridden);
}
