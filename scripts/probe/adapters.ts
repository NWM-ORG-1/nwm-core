/**
 * Dry-runs catalog sources against the live endpoints and prints what the
 * adapters parsed — no database. Used by the feeds-probe workflow; locally:
 *
 *   npx tsx scripts/probe/adapters.ts [slug-substring …]
 *
 * Sources whose keys are missing are reported as skipped.
 */
import { CATALOG } from "../../src/ingest/catalog";
import { executeAdapter } from "../../src/ingest/execute";
import { HostLimiter } from "../../src/ingest/http";
import { ConfigError } from "../../src/ingest/types";

const filters = process.argv.slice(2);
const limiter = new HostLimiter();
const fmt = (d?: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");
const short = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function probe(slug: string) {
  const e = CATALOG.find((x) => x.slug === slug)!;
  const head = `\n━━ ${e.slug} [${e.adapter}]${e.status === "paused" ? " (paused in catalog)" : ""}`;
  const started = Date.now();
  try {
    let state: Record<string, unknown> = {};
    // stateful diffs (exchange lists) need a baseline first
    const runs = e.adapter === "exchange.markets" ? 2 : 1;
    let ex;
    for (let i = 0; i < runs; i++) {
      ex = await executeAdapter(
        { id: e.slug, slug: e.slug, name: e.name, url: e.url ?? null, lang: e.lang, beats: e.beats, trustTier: e.trustTier, signalOnly: Boolean(e.signalOnly), pollIntervalSec: e.pollIntervalSec ?? 600, adapter: e.adapter, config: e.config, auth: {}, state },
        { limiter },
      );
      state = ex.state;
    }
    const r = ex!.result;
    console.log(`${head} → OK ${Date.now() - started}ms, ${ex!.requests} req, http ${ex!.httpStatus ?? "-"} · ${r.note ?? ""}`);
    console.log(`   items ${r.items?.length ?? 0} · posts ${r.posts?.length ?? 0} · quotes ${r.quotes?.length ?? 0} · metrics ${r.metrics?.length ?? 0}`);
    for (const i of (r.items ?? []).slice(0, 3)) console.log(`   • ${short(i.title)} | ${fmt(i.publishedAt)} | ${short(i.url ?? "", 90)}${i.summary ? `\n     ${short(i.summary, 140)}` : ""}`);
    for (const p of (r.posts ?? []).slice(0, 4)) console.log(`   ◦ ${short(p.text, 80)} | ${fmt(p.postedAt)} | ${JSON.stringify(p.engagement ?? {})} | ${p.author ?? ""}`);
    for (const q of (r.quotes ?? []).slice(0, 6)) console.log(`   $ ${q.symbol} ${q.price} ${q.currency} ${q.changePct}% spark ${q.spark?.length ?? "-"} as of ${fmt(q.asOf)}`);
    for (const m of (r.metrics ?? []).slice(-4)) console.log(`   ~ ${m.metric} ${m.symbol} ${m.source} ${fmt(m.at)} = ${m.value}`);
  } catch (err) {
    const kind = err instanceof ConfigError ? "SKIP" : "FAIL";
    console.log(`${head} → ${kind} ${Date.now() - started}ms · ${(err as Error).message}`);
  }
}

async function main() {
  const slugs = CATALOG.map((e) => e.slug).filter((s) => !filters.length || filters.some((f) => s.includes(f)));
  // a few at a time: the shared limiter keeps each host polite
  const queue = [...slugs];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length) await probe(queue.shift()!);
    }),
  );
}

main();
