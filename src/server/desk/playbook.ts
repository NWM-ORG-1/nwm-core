import { desc } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db/client";
import { deskPlaybooks } from "@/db/schema";
import { callClaude, type ClaudeGeneratorOptions, type CallUsage } from "../generator/claude";
import type { DeskModel } from "./types";

/**
 * The desk's editorial guide: plain bullet points the triage prompt reads. It
 * starts from INITIAL_PLAYBOOK; the weekly review (or an editor) writes new
 * versions, and the newest one is used.
 */

export const INITIAL_PLAYBOOK = `- 독자: 국내 투자자와 AI·경제·테크 업계 종사자. 무엇이 달라지는지 바로 알 수 있는 소식을 고른다.
- 우선: 공시·실적·통계·정책 발표·논문·공식 발표처럼 1차 자료로 확인되는 소식. 숫자로 설명할 수 있으면 더 좋다.
- 우선: 국내 기업·시장·규제에 영향을 주는 해외 소식(빅테크, 반도체, AI 모델 공개, 금리·환율).
- 거른다: 홍보성 보도자료, 행사·인사·수상, 단순 일정 안내, 출처가 불분명한 루머, 다른 언론 기사만 있는 소식, 48시간이 지난 소식.
- 거른다: 특정 개인에 대한 의혹이나 부정적 주장, 투자 권유로 읽힐 수 있는 종목 추천.
- 같은 날 한 분야에 쏠리지 않게 한다. 비슷한 주제가 이미 나갔으면 새 사실이 있을 때만 쓴다.
- 논문·기술 발표는 업계에 미칠 영향이 분명한 것만 고른다. 단순 벤치마크 갱신은 거른다.`;

export interface Playbook {
  version: number;
  body: string;
  source: string;
  notes: string;
  createdAt: string;
}

/** The guide in use; creates version 1 from INITIAL_PLAYBOOK on first use. */
export async function activePlaybook(db: Pick<DB, "select" | "insert">): Promise<Playbook> {
  const [row] = await db.select().from(deskPlaybooks).orderBy(desc(deskPlaybooks.version)).limit(1);
  if (row) return { version: row.version, body: row.body, source: row.source, notes: row.notes, createdAt: row.createdAt.toISOString() };
  await db.insert(deskPlaybooks).values({ version: 1, body: INITIAL_PLAYBOOK, source: "initial", notes: "" }).onConflictDoNothing();
  const [first] = await db.select().from(deskPlaybooks).orderBy(desc(deskPlaybooks.version)).limit(1);
  return { version: first.version, body: first.body, source: first.source, notes: first.notes, createdAt: first.createdAt.toISOString() };
}

export async function savePlaybookVersion(
  db: Pick<DB, "select" | "insert">,
  input: { body: string; source: "ai" | "editor"; notes: string; createdById?: string | null },
): Promise<number> {
  const current = await activePlaybook(db);
  const version = current.version + 1;
  await db.insert(deskPlaybooks).values({ version, body: input.body.trim(), source: input.source, notes: input.notes.slice(0, 1000), createdById: input.createdById ?? null });
  return version;
}

/* ───────────────────────── weekly review ───────────────────────── */

export const REFLECT_MODEL = "claude-sonnet-5-5";
/** the weekly review runs when this much has happened since the last one */
export const REFLECT_MIN = { measured: 10, editorCalls: 10 };
export const REFLECT_EVERY_DAYS = 7;

const REFLECT_SYSTEM = `당신은 뉴웹미디어 AI 데스크의 편집 지침을 고치는 편집장입니다. 지침은 피드에서 어떤 소식을 기사로 고를지 정하는 짧은 원칙 목록입니다. 지난 기간 기사별 독자 반응과 편집자의 발행·폐기 결정을 보고 지침을 고칩니다.

원칙:
- 데이터가 뒷받침하는 만큼만 바꿉니다. 표본이 적은 신호(몇 건)는 "시험해 본다" 정도로만 반영합니다.
- 검색 유입이 거의 없는 초기에는 조회수보다 완독률·체류시간을 더 믿습니다.
- 사실 확인, 1차 자료 우선, 개인에 대한 의혹 배제, 투자 권유 금지 원칙은 유지합니다.
- 결과는 "- "로 시작하는 줄 5–10개, 전체 1,500자 이내의 한국어 평서문입니다.
- changes에는 무엇을 왜 바꿨는지 1–5개를 씁니다. 바꿀 것이 없으면 기존 지침을 그대로 돌려주고 changes에 그렇게 씁니다.`;

const ReflectOut = z.object({
  body: z.string().describe("새 편집 지침: '- '로 시작하는 줄 5–10개, 1,500자 이내"),
  changes: z.array(z.string()).describe("바꾼 점과 이유 1–5개, 각 한 문장"),
});

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export function reflectPrompt(input: { playbook: Playbook; model: DeskModel; rejected: Array<{ title: string; topic: string; reason: string }> }): string {
  const m = input.model;
  const effects = (rec: Record<string, { mean: number; n: number }>) =>
    Object.entries(rec)
      .filter(([k, e]) => k && e.n >= 2)
      .sort((a, b) => b[1].mean - a[1].mean)
      .map(([k, e]) => `${k} ${e.mean >= 0 ? "+" : ""}${fmt(e.mean)} (${e.n}건)`)
      .join(", ") || "(표본 부족)";
  const brief = (a: DeskModel["top"][number]) => `- [${a.beat}·${a.topic || "주제 없음"}] ${a.title} — 조회 ${a.views}, 완독률 ${Math.round(a.readRate * 100)}%, 점수 ${fmt(a.perf)}`;
  return [
    `<지금 지침 버전="${input.playbook.version}">`,
    input.playbook.body,
    "</지금 지침>",
    "",
    `학습 단계: ${m.phase} · 측정 기사 ${m.measured}건 · 기사당 조회 중앙값 ${m.medianViews} · 평균 완독률 ${Math.round(m.readRate * 100)}%`,
    `유입(30일): 검색 ${m.traffic.search} · SNS ${m.traffic.social} · 직접 ${m.traffic.direct} · 사이트 안 ${m.traffic.internal} · 기타 ${m.traffic.other}`,
    "",
    `독자 반응(주제): ${effects(m.reader.topic)}`,
    `독자 반응(분야): ${effects(m.reader.beat)}`,
    `독자 반응(출처): ${effects(m.reader.source)}`,
    `편집자 결정: 데스크 초안 ${m.editor.total}건 중 발행 ${m.editor.published}, 폐기 ${m.editor.rejected} · 주제별 ${effects(m.editor.topic)}`,
    "",
    "반응이 좋았던 기사:",
    ...(m.top.length ? m.top.map(brief) : ["(없음)"]),
    "",
    "반응이 약했던 기사:",
    ...(m.bottom.length ? m.bottom.map(brief) : ["(없음)"]),
    "",
    "편집자가 버린 데스크 초안:",
    ...(input.rejected.length ? input.rejected.slice(0, 15).map((r) => `- [${r.topic || "주제 없음"}] ${r.title}${r.reason ? ` — 사유: ${r.reason}` : ""}`) : ["(없음)"]),
  ].join("\n");
}

export async function reflect(
  o: Pick<ClaudeGeneratorOptions, "create" | "ledger">,
  model: string,
  input: Parameters<typeof reflectPrompt>[0],
): Promise<{ body: string; changes: string[]; usage: CallUsage }> {
  const { out, usage } = await callClaude(o, {
    purpose: "desk:playbook",
    model,
    system: REFLECT_SYSTEM,
    user: reflectPrompt(input),
    schema: ReflectOut,
    maxTokens: 4000,
  });
  const body = out.body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.startsWith("- ") ? l : `- ${l.replace(/^[-•·*]\s*/, "")}`))
    .slice(0, 12)
    .join("\n")
    .slice(0, 2000);
  return { body: body || input.playbook.body, changes: out.changes.map((c) => c.trim()).filter(Boolean).slice(0, 5), usage };
}
