import { and, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ingestRuns, socialPosts } from "@/db/schema";
import { LEXICON_ID, lexiconScore } from "@/sentiment/lexicon";
import { labelBatch, llmAvailable, sentimentModel, type LlmLabel } from "@/sentiment/llm";
import type { Job } from "../jobs";

/**
 * Labels new posts every 10 minutes: Claude (default Haiku 5.5) for posts whose
 * source allows AI analysis, while the month's spend is under
 * SENTIMENT_LLM_MONTHLY_USD; the lexicon for everything else.
 */

const PER_RUN = 600;
const BATCH = 50;

export async function monthSpendUsd(): Promise<number> {
  const [r] = await db
    .select({ usd: sql<number>`coalesce(sum((${ingestRuns.meta}->>'costUsd')::float8), 0)` })
    .from(ingestRuns)
    .where(and(eq(ingestRuns.job, "sentiment.score"), gte(ingestRuns.startedAt, sql`date_trunc('month', now())`)));
  return Number(r?.usd ?? 0);
}

export function llmBudgetUsd(): number {
  const v = Number(process.env.SENTIMENT_LLM_MONTHLY_USD ?? 30);
  return Number.isFinite(v) && v >= 0 ? v : 30;
}

const clean = (t: string) => t.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 280);

export const sentimentScoreJob: Job = {
  name: "sentiment.score",
  everySec: 600,
  offsetSec: 60,
  async run() {
    const rows = await db
      .select({ id: socialPosts.id, text: socialPosts.text, llmOk: socialPosts.llmOk, assets: socialPosts.assets })
      .from(socialPosts)
      .where(and(isNull(socialPosts.scoredAt), isNotNull(socialPosts.text)))
      .orderBy(sql`${socialPosts.postedAt} desc`)
      .limit(PER_RUN);
    if (!rows.length) return { note: "no new posts" };

    const model = sentimentModel();
    const budget = llmBudgetUsd();
    const spent = await monthSpendUsd();
    let costUsd = 0;
    let llmErrors = 0;
    let firstError: string | undefined;
    const results = new Map<string, { stance: number | null; label: string; by: string; assets: string[] }>();

    const llmRows = llmAvailable() ? rows.filter((r) => r.llmOk) : [];
    for (let i = 0; i < llmRows.length && spent + costUsd < budget; i += BATCH) {
      const batch = llmRows.slice(i, i + BATCH);
      try {
        const out = await labelBatch(
          batch.map((r, n) => ({ i: n, t: clean(r.text ?? "") })),
          model,
        );
        if (!out) continue; // refusal or unusable output: lexicon below
        costUsd += out.costUsd;
        batch.forEach((r, n) => {
          const l: LlmLabel | undefined = out.labels.get(n);
          if (l) results.set(r.id, { stance: l.stance, label: l.label, by: model, assets: l.assets });
        });
      } catch (err) {
        llmErrors++;
        firstError ??= (err as Error).message.slice(0, 200);
        if (llmErrors >= 3) break;
      }
    }

    let lexicon = 0;
    for (const r of rows) {
      if (results.has(r.id)) continue;
      const l = lexiconScore(r.text ?? "");
      results.set(r.id, { stance: l.stance, label: l.label, by: LEXICON_ID, assets: [] });
      lexicon++;
    }

    const values = [...results].map(([id, v]) => sql`(${id}::uuid, ${v.stance}::real, ${v.label}, ${v.by}, ${`{${v.assets.map((a) => `"${a}"`).join(",")}}`}::text[])`);
    for (let i = 0; i < values.length; i += 300) {
      await db.execute(sql`
        update social_posts as p
        set stance = v.stance, label = v.label, scored_by = v.by, scored_at = now(),
            assets = (select coalesce(array_agg(distinct a), '{}') from unnest(p.assets || v.assets) as a)
        from (values ${sql.join(values.slice(i, i + 300), sql`, `)}) as v(id, stance, label, by, assets)
        where p.id = v.id`);
    }

    const llm = results.size - lexicon;
    return {
      seen: rows.length,
      updated: results.size,
      note: `${llm} by ${model}${llm ? ` ($${costUsd.toFixed(4)})` : ""}, ${lexicon} by lexicon${spent + costUsd >= budget ? " — monthly LLM budget reached" : ""}${llmErrors ? `, ${llmErrors} API errors (${firstError})` : ""}`,
      meta: { costUsd: Math.round(costUsd * 1e6) / 1e6, llm, lexicon, model, monthUsd: Math.round((spent + costUsd) * 100) / 100 },
    };
  },
};
