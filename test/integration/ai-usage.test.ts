import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db/client";
import { aiUsage } from "@/db/schema";
import { createClaudeGenerator, type CreateCall } from "@/server/generator/claude";
import { aiMonthSpendUsd, dbLedger } from "@/server/generator/ledger";

/** Needs Postgres (DATABASE_URL); CI provides one. Removes its own rows. */
const enabled = Boolean(process.env.DATABASE_URL);
const PURPOSE = "itest";

describe("AI usage ledger", { skip: !enabled && "DATABASE_URL not set" }, () => {
  after(async () => {
    await db.delete(aiUsage).where(eq(aiUsage.purpose, PURPOSE));
    await db.delete(aiUsage).where(eq(aiUsage.model, "claude-itest"));
    await closeDb();
  });

  it("records calls and sums this month's spend", async () => {
    const before = await aiMonthSpendUsd(db);
    const ledger = dbLedger(db);
    const row = { purpose: PURPOSE, model: "claude-sonnet-5-5", inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 5 };
    await ledger.record({ ...row, costUsd: 0.25, ok: true });
    await ledger.record({ ...row, costUsd: 0.5, ok: false, error: "x".repeat(1000) });
    const spent = await ledger.monthSpendUsd();
    assert.ok(Math.abs(spent - before - 0.75) < 1e-9, `spent ${spent}, before ${before}`);
    const rows = await db.select().from(aiUsage).where(eq(aiUsage.purpose, PURPOSE));
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => !r.ok)?.error?.length, 300, "long errors are cut");
  });

  it("stops the generator at the monthly cap it reads from the table", async () => {
    let calls = 0;
    const create: CreateCall = async () => {
      calls++;
      throw new Error("should not be called");
    };
    const spent = await aiMonthSpendUsd(db);
    const gen = createClaudeGenerator({ create, model: "claude-itest", budgetUsd: spent, ledger: dbLedger(db) });
    const g = await gen.draftFromItems({
      items: [{ id: "x", title: "t", summary: "s", sourceName: "n", sourceKind: "rss", trustTier: 1, signalOnly: false, lang: "ko", entities: [], payload: {}, url: null }],
      beat: "ai",
      mode: "feed_draft",
    });
    assert.equal(calls, 0);
    assert.match(g.aiNote ?? "", /한도/);
  });
});
