/**
 * Writes drafts for the same inbox items with several Claude models and puts
 * them side by side, with time, tokens, cost and the newsroom's own checks
 * (numbers found in the sources, brevity, verbatim copying).
 *
 *   npm run compare:drafts                                   plan only: items, models, estimated cost
 *   npm run compare:drafts -- --run                          call the models (needs ANTHROPIC_API_KEY)
 *   npm run compare:drafts -- --run --items 8 --models claude-opus-5-5,claude-sonnet-5-5@medium
 *   npm run compare:drafts -- --run --candidates <id>,<id>   use the items linked to these candidates
 *   npm run compare:drafts -- --samples                      include seeded sample items (local trial)
 *
 * Each item is drafted once per model (model@effort sets the effort). Calls
 * are recorded in ai_usage as "compare" and count toward DRAFT_LLM_MONTHLY_USD.
 * The report goes to reports/draft-compare-<time>.md (and .json).
 */
import { mkdir, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { candidateItems, candidates, feedItems, feedSources, type Beat, type CandidateMode } from "../src/db/schema";
import { hasAnthropicKey, modelInfo, parseEffort, type Effort } from "../src/lib/ai/models";
import { BLOCK_TITLE_KO, SECTION_LABEL_KO, type Draft } from "../src/lib/content/blocks";
import { dateTimeKST } from "../src/lib/format";
import { runChecks, type CheckItem } from "../src/server/checks";
import { writeDraft, type CallUsage } from "../src/server/generator/claude";
import { dbLedger } from "../src/server/generator/ledger";
import type { GenItem } from "../src/server/generator/types";

const DEFAULT_MODELS = "claude-opus-5-5,claude-sonnet-5-5,claude-haiku-5-5";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Variant {
  model: string;
  effort?: Effort;
  key: string;
}

function variants(spec: string): Variant[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [model, e] = s.split("@");
      const effort = parseEffort(e);
      if (e && !effort) throw new Error(`effort를 알 수 없습니다: ${s} (low|medium|high|xhigh|max)`);
      return { model, effort, key: effort ? `${model}@${effort}` : model };
    });
}

interface Group {
  label: string;
  beat: Beat;
  mode: CandidateMode;
  idea: string | null;
  items: GenItem[];
  checkItems: CheckItem[];
}

const itemColumns = {
  id: feedItems.id,
  title: feedItems.title,
  summary: feedItems.summary,
  url: feedItems.url,
  lang: feedItems.lang,
  entities: feedItems.entities,
  payload: feedItems.payload,
  publishedAt: feedItems.publishedAt,
  beatGuess: feedItems.beatGuess,
  sourceName: feedSources.name,
  sourceKind: feedSources.kind,
  trustTier: feedSources.trustTier,
  signalOnly: feedSources.signalOnly,
  commercialOk: feedSources.licCommercialOk,
  verbatimOk: feedSources.licVerbatimOk,
  reviewedAt: feedSources.licReviewedAt,
};
const selectItems = () => db.select(itemColumns).from(feedItems).innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id));
type ItemRow = Awaited<ReturnType<typeof selectItems>>[number];

const toGen = (r: ItemRow): GenItem => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  sourceName: r.sourceName,
  sourceKind: r.sourceKind,
  trustTier: r.trustTier,
  signalOnly: r.signalOnly,
  lang: r.lang,
  entities: r.entities,
  payload: r.payload,
  url: r.url,
  publishedAt: r.publishedAt,
});

const toCheck = (r: ItemRow): CheckItem => ({
  title: r.title,
  summary: r.summary,
  payload: r.payload,
  signalOnly: r.signalOnly,
  trustTier: r.trustTier,
  sourceName: r.sourceName,
  lic: { commercialOk: r.commercialOk, verbatimOk: r.verbatimOk, reviewed: r.reviewedAt != null },
});

async function groupsFromCandidates(ids: string[]): Promise<Group[]> {
  const out: Group[] = [];
  for (const id of ids) {
    const c = await db.query.candidates.findFirst({ where: eq(candidates.id, id) });
    if (!c) throw new Error(`후보를 찾을 수 없습니다: ${id}`);
    const rows = await db
      .select(itemColumns)
      .from(candidateItems)
      .innerJoin(feedItems, eq(candidateItems.feedItemId, feedItems.id))
      .innerJoin(feedSources, eq(feedItems.sourceId, feedSources.id))
      .where(eq(candidateItems.candidateId, id))
      .orderBy(sql`case when ${candidateItems.role} = 'primary' then 0 else 1 end`);
    out.push({ label: c.draft.title || c.idea || id, beat: c.beat, mode: c.mode === "data_auto" ? "feed_draft" : c.mode, idea: c.idea, items: rows.map(toGen), checkItems: rows.map(toCheck) });
  }
  return out;
}

/** Recent real items, highest score first, one per source so the set covers different kinds of input. */
async function recentGroups(n: number, samples: boolean): Promise<Group[]> {
  const rows = await selectItems()
    .where(
      and(
        samples ? undefined : eq(feedSources.isSample, false),
        eq(feedSources.signalOnly, false),
        inArray(feedItems.status, ["new", "promoted"]),
        gte(feedItems.fetchedAt, sql`now() - interval '7 days'`),
        sql`length(${feedItems.summary}) >= 40`,
      ),
    )
    .orderBy(desc(feedItems.score), desc(feedItems.fetchedAt))
    .limit(400);
  const bySource = new Set<string>();
  const picked = rows.filter((r) => !bySource.has(r.sourceName) && bySource.add(r.sourceName)).slice(0, n);
  return picked.map((r) => ({ label: r.title, beat: (r.beatGuess ?? "tech") as Beat, mode: "feed_draft", idea: null, items: [toGen(r)], checkItems: [toCheck(r)] }));
}

/* ───────────────────────── report ───────────────────────── */

interface Result {
  group: number;
  variant: string;
  ok: boolean;
  error?: string;
  usage?: CallUsage;
  draft?: Draft;
  aiNote?: string | null;
  checks?: { numbers: string; brevity: string; license: string; numbersOk: boolean; brevityOk: boolean; licenseOk: boolean };
}

function draftMarkdown(d: Draft): string {
  const out = [`**${d.title}**`, "", `> ${d.dek}`, ""];
  for (const b of d.blocks) {
    if (b.type === "why" || b.type === "next") out.push(`- _${BLOCK_TITLE_KO[b.type]}_: ${b.items.join(" / ")}`);
    else if (b.type === "numbers") out.push(`- _${BLOCK_TITLE_KO.numbers}_: ${b.items.map((k) => `${k.value} ${k.label}`).join(" · ")}`);
    else if (b.type === "section") out.push(`- _${SECTION_LABEL_KO[b.label]}_: ${[b.text, ...(b.bullets ?? [])].filter(Boolean).join(" / ")}`);
  }
  out.push("", `태그 ${d.tags.join(", ") || "—"} · 종목 ${d.tickers.join(", ") || "—"} · 출처 ${d.sources.map((s) => s.name).join(", ") || "—"}`);
  return out.join("\n");
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function report(groups: Group[], vs: Variant[], results: Result[], startedAt: Date): string {
  const total = results.reduce((s, r) => s + (r.usage?.costUsd ?? 0), 0);
  const lines = [
    `# AI 초안 모델 비교 — ${dateTimeKST(startedAt)} KST`,
    "",
    `자료 ${groups.length}건 × 모델 ${vs.length}개 · 총 비용 $${total.toFixed(4)}`,
    "",
    "| 모델 | 성공 | 평균 시간 | 평균 토큰 (입력/출력) | 평균 비용 | 수치 대조 통과 | 간결성 통과 | 라이선스 통과 | 제목 평균 길이 |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const v of vs) {
    const rs = results.filter((r) => r.variant === v.key);
    const ok = rs.filter((r) => r.ok);
    const pct = (f: (r: Result) => boolean | undefined) => (ok.length ? `${Math.round((ok.filter(f).length / ok.length) * 100)}%` : "—");
    lines.push(
      `| ${v.key} | ${ok.length}/${rs.length} | ${(avg(ok.map((r) => r.usage!.latencyMs)) / 1000).toFixed(1)}초 | ${Math.round(avg(ok.map((r) => r.usage!.inputTokens))).toLocaleString()} / ${Math.round(avg(ok.map((r) => r.usage!.outputTokens))).toLocaleString()} | $${avg(ok.map((r) => r.usage!.costUsd)).toFixed(4)} | ${pct((r) => r.checks?.numbersOk)} | ${pct((r) => r.checks?.brevityOk)} | ${pct((r) => r.checks?.licenseOk)} | ${Math.round(avg(ok.map((r) => r.draft!.title.length)))}자 |`,
    );
  }
  groups.forEach((g, n) => {
    lines.push("", `## ${n + 1}. ${g.label}`, "", `자료: ${g.items.map((i) => `${i.sourceName}(등급 ${i.trustTier})`).join(", ") || "없음 (아이디어만)"}`);
    for (const v of vs) {
      const r = results.find((x) => x.group === n && x.variant === v.key);
      if (!r) continue;
      if (!r.ok) {
        lines.push("", `### ${v.key} — 실패`, "", `\`${r.error}\``);
        continue;
      }
      const c = r.checks!;
      lines.push(
        "",
        `### ${v.key} — ${(r.usage!.latencyMs / 1000).toFixed(1)}초 · $${r.usage!.costUsd.toFixed(4)} · 수치 ${c.numbersOk ? "✓" : "✗"} · 간결성 ${c.brevityOk ? "✓" : "✗"} · 라이선스 ${c.licenseOk ? "✓" : "✗"}`,
        "",
        draftMarkdown(r.draft!),
      );
      const flags = [!c.numbersOk && c.numbers, !c.brevityOk && c.brevity, !c.licenseOk && c.license].filter(Boolean);
      if (flags.length) lines.push("", `체크: ${flags.join(" · ")}`);
      if (r.aiNote) lines.push("", `AI 메모: ${r.aiNote}`);
    }
  });
  return lines.join("\n") + "\n";
}

/* ───────────────────────── main ───────────────────────── */

async function main() {
  const vs = variants(arg("models") ?? DEFAULT_MODELS);
  const run = process.argv.includes("--run");
  const candidateIds = arg("candidates")?.split(",").filter(Boolean);
  const groups = candidateIds?.length ? await groupsFromCandidates(candidateIds) : await recentGroups(Number(arg("items") ?? 5), process.argv.includes("--samples"));
  if (!groups.length) throw new Error("비교할 자료가 없습니다 — 최근 7일 안에 수집된 실제 피드 항목이 필요합니다 (샘플·신호 전용 제외).");

  console.log(`자료 ${groups.length}건:`);
  groups.forEach((g, n) => console.log(`  ${n + 1}. [${g.beat}] ${g.label.slice(0, 70)} — ${g.items.map((i) => i.sourceName).join(", ") || "아이디어"}`));
  // a rough ceiling: ~3k prompt tokens and up to ~4k output (answer plus adaptive thinking) per draft
  console.log("모델:");
  let ceiling = 0;
  for (const v of vs) {
    const p = modelInfo(v.model);
    const per = (3000 * p.input + 4000 * p.output) / 1e6;
    ceiling += per * groups.length;
    console.log(`  ${v.key}${p.known ? "" : " (가격표에 없음 — 최고가로 추정)"}: 초안당 최대 약 $${per.toFixed(3)}`);
  }
  console.log(`예상 비용: 최대 약 $${ceiling.toFixed(2)}`);
  if (!run) {
    console.log("\n실행하려면 --run 을 붙이세요.");
    return;
  }
  if (!hasAnthropicKey()) throw new Error("ANTHROPIC_API_KEY가 없습니다.");

  const client = new Anthropic({ maxRetries: 2, timeout: 180_000 });
  const ledger = dbLedger(db);
  const startedAt = new Date();
  const results: Result[] = [];

  for (const [n, g] of groups.entries()) {
    // models side by side for one item, items one after another
    await Promise.all(
      vs.map(async (v) => {
        try {
          const out = await writeDraft(
            { create: (body) => client.messages.create(body), model: v.model, effort: v.effort, budgetUsd: Infinity, ledger },
            { items: g.items, beat: g.beat, mode: g.mode, idea: g.idea },
            "compare",
          );
          const checks = runChecks({ draft: out.draft, mode: g.mode, items: g.checkItems, recentTitles: [], previous: [], editorName: "비교" });
          const c = (id: string) => checks.find((x) => x.id === id)!;
          results.push({
            group: n,
            variant: v.key,
            ok: true,
            usage: out.usage,
            draft: out.draft,
            aiNote: out.aiNote,
            checks: {
              numbers: c("numbers").message,
              brevity: c("brevity").message,
              license: c("license").message,
              numbersOk: c("numbers").ok,
              brevityOk: c("brevity").ok,
              licenseOk: c("license").ok,
            },
          });
          console.log(`  ✓ ${n + 1} ${v.key}: ${(out.usage.latencyMs / 1000).toFixed(1)}s $${out.usage.costUsd.toFixed(4)}`);
        } catch (e) {
          const err = e as Error & { usage?: CallUsage };
          results.push({ group: n, variant: v.key, ok: false, error: err.message, usage: err.usage });
          console.log(`  ✗ ${n + 1} ${v.key}: ${err.message}`);
        }
      }),
    );
  }

  const stamp = startedAt.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const out = arg("out") ?? `reports/draft-compare-${stamp}.md`;
  await mkdir(out.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await writeFile(out, report(groups, vs, results, startedAt));
  await writeFile(out.replace(/\.md$/, "") + ".json", JSON.stringify({ startedAt, variants: vs, groups: groups.map((g) => ({ label: g.label, beat: g.beat, itemIds: g.items.map((i) => i.id) })), results }, null, 2));
  console.log(`\n보고서: ${out}`);
}

main()
  .catch((err) => {
    console.error("✗", (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
