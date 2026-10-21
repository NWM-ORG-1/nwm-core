/**
 * Sample data loader.
 *   npm run db:seed               → replace all sample rows (times are re-anchored to now)
 *   npm run db:seed -- --if-empty → only on a database nobody has used yet (first deploy)
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { closeDb, db } from "../client";
import * as s from "../schema";
import type { CheckResult } from "../schema";
import { blockSchema, draftSchema, readSecondsFor, sentimentSnapshotSchema, sourceRefSchema } from "@/lib/content/blocks";
import { ymdKST } from "@/lib/format";
import { T } from "@/lib/cache-tags";
import { CHECK_META } from "@/server/checks";
import { ALL_LIST_TAGS, revalidateLive } from "../../../scripts/lib/revalidate";
import { EXPERIMENTS, STAFF, STORIES } from "./content/cast";
import { hash32, mulberry32, QUOTES, SENTIMENT_SCOPES, SENTIMENT_SOURCES, walk } from "./content/market";
import { purgeSamples } from "./purge";
import type { SeedArticle } from "./types";

const MIN = 60_000;
const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

async function loadArticles(): Promise<SeedArticle[]> {
  const mods = await Promise.all([
    import("./content/articles-ai"),
    import("./content/articles-crypto"),
    import("./content/articles-economy"),
    import("./content/articles-tech"),
    import("./content/articles-sentiment"),
  ]);
  return mods.flatMap((m) => Object.values(m).find(Array.isArray) as SeedArticle[]);
}

function sampleSlug(key: string, at: Date) {
  const digest = createHash("sha256").update(key).digest();
  let tail = "";
  for (let i = 0; i < 6; i++) tail += ALPHABET[digest[i] % ALPHABET.length];
  return `${ymdKST(at).replace(/-/g, "").slice(2)}-${tail}`;
}

const BEAT_EXPERIMENT: Record<s.Beat, "H1" | "H2" | "H3" | "H4"> = {
  ai: "H3",
  tech: "H1",
  crypto: "H2",
  economy: "H1",
  sentiment: "H4",
};

async function main() {
  const ifEmpty = process.argv.includes("--if-empty");
  if (ifEmpty) {
    // "Used" survives a purge: real staff sign in, real hypotheses get written, and the purge leaves a marker.
    const [r] = await db.execute<{ articles: boolean; staff: boolean; experiments: boolean; purged: boolean }>(sql`select
      exists(select 1 from articles) as articles,
      exists(select 1 from staff where not is_sample) as staff,
      exists(select 1 from experiments where not is_sample) as experiments,
      exists(select 1 from site_settings where key = 'samples_purged') as purged`);
    const why = Object.entries(r).filter(([, v]) => v).map(([k]) => k);
    if (why.length) {
      console.log(`• seed skipped: database already in use (${why.join(", ")})`);
      return;
    }
  }

  const { SOURCES, FEED_ITEMS, CANDIDATES } = await import("./content/newsroom");
  const ARTICLES = await loadArticles();
  const now = Math.floor(Date.now() / MIN) * MIN;
  const at = (ago: number) => new Date(now - ago * MIN);
  const rnd = mulberry32(20261021);

  // Validate everything before touching the database.
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const a of ARTICLES) {
    if (keys.has(a.key)) problems.push(`duplicate article key ${a.key}`);
    keys.add(a.key);
    const blocks = z.array(blockSchema).safeParse(a.blocks);
    if (!blocks.success) problems.push(`${a.key}: ${blocks.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    if (!z.array(sourceRefSchema).safeParse(a.sources).success) problems.push(`${a.key}: invalid sources`);
    if (a.sentiment && !sentimentSnapshotSchema.safeParse(a.sentiment).success) problems.push(`${a.key}: invalid sentiment`);
    if (a.ai !== "auto" && a.ai !== "human" && !a.editor) problems.push(`${a.key}: editor required for ${a.ai}`);
    if (a.story && !STORIES.some((st) => st.key === a.story)) problems.push(`${a.key}: unknown story ${a.story}`);
  }
  for (const c of CANDIDATES) {
    const d = draftSchema.safeParse(c.draft);
    if (!d.success) problems.push(`${c.key}: ${d.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  // referential integrity of the newsroom sample
  const itemKeys = new Set(FEED_ITEMS.map((i) => i.key));
  const sourceSlugs = new Set(SOURCES.map((x) => x.slug));
  for (const it of FEED_ITEMS) if (!sourceSlugs.has(it.source)) problems.push(`${it.key}: unknown source ${it.source}`);
  const referenced = new Map<string, number>();
  for (const c of CANDIDATES) {
    for (const k of c.items) {
      if (!itemKeys.has(k)) problems.push(`${c.key}: unknown feed item ${k}`);
      referenced.set(k, (referenced.get(k) ?? 0) + 1);
    }
    if (c.article && !keys.has(c.article)) problems.push(`${c.key}: unknown article ${c.article}`);
    if (c.story && !STORIES.some((st) => st.key === c.story)) problems.push(`${c.key}: unknown story ${c.story}`);
  }
  for (const it of FEED_ITEMS) {
    const n = referenced.get(it.key) ?? 0;
    if (it.status === "promoted" && n !== 1) problems.push(`${it.key}: promoted item referenced ${n}×`);
    if (it.status !== "promoted" && n > 0) problems.push(`${it.key}: ${it.status} item is attached to a candidate`);
  }
  if (problems.length) {
    console.error("✗ sample content is invalid:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  if (process.argv.includes("--check")) {
    console.log(`✓ sample content valid — ${ARTICLES.length} articles, ${CANDIDATES.length} candidates, ${FEED_ITEMS.length} items, ${SOURCES.length} sources`);
    return;
  }

  const touched = await db.transaction(async (tx) => {
    const before = await tx.execute<{ slug: string }>(sql`select slug from articles where is_sample`);
    const beforeStories = await tx.execute<{ id: string }>(sql`select id from stories where is_sample`);
    await purgeSamples(tx);

    /* staff */
    const staffIds = new Map<string, string>();
    for (const p of STAFF) {
      // Only sample rows are ever overwritten; a real account is never relabelled.
      const [row] = await tx
        .insert(s.staff)
        .values({ login: p.login, name: p.name, slug: p.slug, title: p.title, bio: p.bio, role: "editor", isSample: true })
        .onConflictDoUpdate({ target: s.staff.login, set: { name: p.name, slug: p.slug, title: p.title, bio: p.bio }, setWhere: sql`${s.staff.isSample}` })
        .returning({ id: s.staff.id });
      if (!row) throw new Error(`sample login "${p.login}" belongs to a real account — rename it in seed/content/cast.ts`);
      staffIds.set(p.login, row.id);
    }

    /* experiments */
    const expIds = new Map<string, string>();
    for (const e of EXPERIMENTS) {
      const [row] = await tx
        .insert(s.experiments)
        .values({ ...e, status: "running", startedAt: at(60 * 24 * 14), isSample: true })
        .onConflictDoUpdate({ target: s.experiments.code, set: { name: e.name, hypothesis: e.hypothesis }, setWhere: sql`${s.experiments.isSample}` })
        .returning({ id: s.experiments.id });
      // A real hypothesis owns this code: attach the samples to it without touching it.
      const id = row?.id ?? (await tx.query.experiments.findFirst({ where: (x, { eq }) => eq(x.code, e.code), columns: { id: true } }))!.id;
      expIds.set(e.code, id);
    }

    /* stories */
    const storyIds = new Map<string, string>();
    for (const st of STORIES) {
      const [row] = await tx
        .insert(s.stories)
        .values({ slug: st.slug, beat: st.beat, title: st.title, summary: st.summary, status: st.status, isSample: true })
        .returning({ id: s.stories.id });
      storyIds.set(st.key, row.id);
    }

    /* sources */
    const sourceIds = new Map<string, string>();
    const sourceExp = new Map<string, string>();
    for (const src of SOURCES) {
      const [row] = await tx
        .insert(s.feedSources)
        .values({
          slug: src.slug,
          name: src.name,
          kind: src.kind,
          url: src.url ?? null,
          beats: src.beats,
          lang: src.lang,
          status: src.status,
          experimentId: expIds.get(src.experiment) ?? null,
          adapter: src.adapter,
          pollIntervalSec: src.pollIntervalSec,
          trustTier: src.trustTier,
          signalOnly: Boolean(src.signalOnly),
          licCommercialOk: src.license.commercialOk,
          licRedistributionOk: src.license.redistributionOk,
          licVerbatimOk: src.license.verbatimOk,
          licAttribution: src.license.attribution ?? null,
          licRetentionDays: src.license.retentionDays ?? null,
          licTermsUrl: src.license.termsUrl ?? null,
          licReviewedAt: src.license.reviewed ? at(60 * 24 * 3) : null,
          licReviewedBy: src.license.reviewed ? "이준" : null,
          lastFetchedAt: at(src.lastAgo),
          lastError: src.lastError ?? null,
          isSample: true,
        })
        .returning({ id: s.feedSources.id });
      sourceIds.set(src.slug, row.id);
      sourceExp.set(src.slug, expIds.get(src.experiment) ?? "");
    }

    /* feed items */
    const itemIds = new Map<string, string>();
    const itemSource = new Map<string, string>();
    for (const it of FEED_ITEMS) {
      const sourceId = sourceIds.get(it.source);
      if (!sourceId) throw new Error(`feed item ${it.key}: unknown source ${it.source}`);
      const [row] = await tx
        .insert(s.feedItems)
        .values({
          sourceId,
          externalId: it.key,
          contentHash: hash32(it.title + it.summary).toString(16),
          url: it.url ?? null,
          title: it.title,
          summary: it.summary,
          lang: it.lang,
          payload: it.payload ?? {},
          entities: it.entities,
          beatGuess: it.beat,
          score: Math.max(0, Math.min(100, Math.round(it.score))),
          status: it.status,
          dismissedReason: it.dismissedReason ?? null,
          publishedAt: at(it.ago + 2),
          fetchedAt: at(it.ago),
          isSample: true,
        })
        .returning({ id: s.feedItems.id });
      itemIds.set(it.key, row.id);
      itemSource.set(it.key, it.source);
    }

    /* articles */
    const articleIds = new Map<string, { id: string; slug: string; publishedAt: Date }>();
    for (const a of ARTICLES) {
      const publishedAt = at(a.ago);
      const slug = sampleSlug(a.key, publishedAt);
      const corrections = a.corrections ?? [];
      const revision = 1 + corrections.length;
      const [row] = await tx
        .insert(s.articles)
        .values({
          slug,
          beat: a.beat,
          storyId: a.story ? storyIds.get(a.story)! : null,
          experimentId: expIds.get(a.ai === "auto" ? "H2" : BEAT_EXPERIMENT[a.beat]) ?? null,
          title: a.title,
          dek: a.dek,
          blocks: a.blocks,
          tags: a.tags,
          tickers: a.tickers,
          sources: a.sources,
          sentiment: a.sentiment ?? null,
          aiInvolvement: a.ai,
          generator: a.ai === "ai_draft_edited" || a.ai === "ai_assisted" ? { id: "mock-1", version: "1.0.0", generatedAt: publishedAt.toISOString(), inputItemIds: [] } : null,
          authorId: a.author ? staffIds.get(a.author)! : null,
          editorId: a.editor ? staffIds.get(a.editor)! : null,
          byline: a.byline,
          status: a.unpublished ? "unpublished" : "published",
          isBreaking: Boolean(a.breaking),
          readSeconds: readSecondsFor(a.title, a.dek, a.blocks),
          revision,
          publishedAt,
          updatedAt: corrections.length ? new Date(publishedAt.getTime() + Math.max(...corrections.map((c) => c.after)) * MIN) : publishedAt,
          createdAt: publishedAt,
          isSample: true,
        })
        .returning({ id: s.articles.id });
      articleIds.set(a.key, { id: row.id, slug, publishedAt });

      // revision history (+ public corrections)
      let rev = 1;
      let title = a.title;
      let dek = a.dek;
      if (corrections.length) {
        const first = corrections[0];
        title = first.before?.title ?? a.title;
        dek = first.before?.dek ?? a.dek;
      }
      await tx.insert(s.articleRevisions).values({
        articleId: row.id,
        revision: rev,
        title,
        dek,
        blocks: a.blocks,
        sources: a.sources,
        editedBy: a.editor ? staffIds.get(a.editor)! : null,
        reason: "최초 발행",
        createdAt: publishedAt,
      });
      for (const c of corrections) {
        rev += 1;
        const when = new Date(publishedAt.getTime() + c.after * MIN);
        await tx.insert(s.articleRevisions).values({
          articleId: row.id,
          revision: rev,
          title: a.title,
          dek: a.dek,
          blocks: a.blocks,
          sources: a.sources,
          editedBy: a.editor ? staffIds.get(a.editor)! : null,
          reason: c.kind === "correction" ? "정정" : c.kind === "clarification" ? "명확화" : "업데이트",
          createdAt: when,
        });
        await tx.insert(s.articleCorrections).values({
          articleId: row.id,
          revision: rev,
          kind: c.kind,
          note: c.note,
          createdBy: a.editor ? staffIds.get(a.editor)! : null,
          publishedAt: when,
        });
      }

      // 7 days of reading stats, shaped by age
      const total = a.views ?? Math.round(800 + rnd() * 9000);
      const ageDays = Math.min(6, Math.floor(a.ago / (60 * 24)));
      const readRate = 0.45 + rnd() * 0.4;
      const nextRate = 0.3 + rnd() * 0.4;
      const readSec = readSecondsFor(a.title, a.dek, a.blocks);
      const weights = Array.from({ length: ageDays + 1 }, (_, i) => Math.pow(0.45, i));
      const wsum = weights.reduce((x, y) => x + y, 0);
      for (let d = 0; d <= ageDays; d++) {
        const views = Math.round((total * weights[d]) / wsum);
        if (!views) continue;
        const day = ymdKST(new Date(publishedAt.getTime() + d * 24 * 60 * MIN));
        await tx
          .insert(s.articleStatsDaily)
          .values({
            articleId: row.id,
            day,
            views,
            reads: Math.round(views * readRate),
            nexts: Math.round(views * nextRate),
            dwellMs: Math.round(views * readRate * readSec * 900),
          })
          .onConflictDoNothing();
      }
    }

    /* stories: counts */
    await tx.execute(sql`
      update stories st set
        article_count = (select count(*) from articles a where a.story_id = st.id and a.status = 'published'),
        last_published_at = (select max(published_at) from articles a where a.story_id = st.id and a.status = 'published')
      where st.is_sample`);

    /* one open correction request, 6 days old → triggers the 7-day legal alert */
    const target = ARTICLES.find((a) => a.beat === "economy" && !a.unpublished && a.ago > 60 * 24) ?? ARTICLES.find((a) => !a.unpublished)!;
    await tx.insert(s.correctionRequests).values({
      articleId: articleIds.get(target.key)!.id,
      receivedAt: at(60 * 24 * 6),
      requester: "독자 (샘플)",
      channel: "email",
      claim: "기사에 인용된 수치의 기준 시점이 원문과 다릅니다. 확인 후 정정을 요청합니다. (샘플 요청)",
      status: "open",
      isSample: true,
    });

    /* candidates */
    for (const c of CANDIDATES) {
      const primary = c.items[0];
      const experimentId = primary ? sourceExp.get(itemSource.get(primary) ?? "") || null : null;
      const checks: CheckResult[] = (c.passed ?? []).map((id) => ({
        id,
        ok: true,
        blocking: CHECK_META[id].blocking,
        message: id === "legal" ? "샘플: 편집자 확인 완료" : "샘플: 통과",
      }));
      const assignee = c.assignee ? staffIds.get(c.assignee)! : null;
      const article = c.article ? articleIds.get(c.article) : undefined;
      if (c.status === "published" && !article) throw new Error(`${c.key}: published candidate needs a known article key`);
      const [row] = await tx
        .insert(s.candidates)
        .values({
          status: c.status,
          mode: c.mode,
          beat: c.beat,
          priority: c.priority,
          idea: c.idea ?? null,
          experimentId: experimentId || (c.mode === "data_auto" ? expIds.get("H2")! : null),
          storyId: c.story ? storyIds.get(c.story)! : null,
          draft: c.draft,
          checks,
          aiNote: c.aiNote ?? null,
          generator:
            c.status === "new"
              ? null
              : { id: c.mode === "data_auto" ? "template:crypto_daily" : "mock-1", version: "1.0.0", generatedAt: at(c.ago).toISOString(), inputItemIds: [] },
          assigneeId: assignee,
          scheduledAt: c.status === "scheduled" ? new Date(now + (c.scheduledIn ?? 20) * MIN) : null,
          scheduledById: c.status === "scheduled" ? (assignee ?? staffIds.get("desk-market")!) : null,
          articleId: article?.id ?? null,
          seedKey: c.key,
          isSample: true,
          createdAt: at(c.ago),
          updatedAt: at(Math.max(1, Math.floor(c.ago / 3))),
        })
        .returning({ id: s.candidates.id });
      if (c.items.length) {
        await tx.insert(s.candidateItems).values(
          c.items.map((k, i) => {
            const fid = itemIds.get(k);
            if (!fid) throw new Error(`${c.key}: unknown feed item ${k}`);
            return { candidateId: row.id, feedItemId: fid, role: i === 0 ? "primary" : "supporting" };
          }),
        );
      }
      if (article) {
        await tx.update(s.articles).set({ candidateId: row.id }).where(sql`${s.articles.id} = ${article.id}`);
      }
    }

    /* market quotes */
    let sort = 0;
    for (const q of QUOTES) {
      await tx
        .insert(s.marketQuotes)
        .values({
          symbol: q.symbol,
          name: q.name,
          price: q.price,
          changePct: q.changePct,
          currency: q.currency,
          spark: walk(q.symbol, q.price, q.changePct, 32),
          sort: sort++,
          inTicker: q.inTicker,
          asOf: new Date(now),
          source: "mock",
        })
        .onConflictDoUpdate({
          target: s.marketQuotes.symbol,
          set: { name: q.name, price: q.price, changePct: q.changePct, currency: q.currency, inTicker: q.inTicker, asOf: new Date(now), source: "mock" },
        });
    }

    /* sentiment: 24 hourly snapshots per scope */
    for (const sc of SENTIMENT_SCOPES) {
      const path = walk(`snt:${sc.scopeKey}`, sc.score + 200, (sc.change24h / (sc.score - sc.change24h + 200)) * 100, 24).map((v) => v - 200);
      const r = mulberry32(hash32(sc.scopeKey));
      const raw = SENTIMENT_SOURCES.map(() => 0.5 + r());
      const sum = raw.reduce((x, y) => x + y, 0);
      for (let h = 0; h < 24; h++) {
        const score = Math.max(-100, Math.min(100, Math.round(path[h] * 10) / 10));
        const bullish = Math.round(50 + score * 0.35 + (r() - 0.5) * 6);
        const bearish = Math.max(0, Math.min(100 - bullish, Math.round(50 - score * 0.35 - 12 + (r() - 0.5) * 6)));
        await tx.insert(s.sentimentSnapshots).values({
          scopeKey: sc.scopeKey,
          label: sc.label,
          at: new Date(now - (23 - h) * 60 * MIN),
          score,
          change24h: h === 23 ? sc.change24h : Math.round((path[h] - path[0]) * 10) / 10,
          bullish,
          bearish,
          volume: Math.round((sc.volume * (0.6 + 0.4 * (h / 23))) / 1),
          sources: SENTIMENT_SOURCES.map((name, i) => ({
            name,
            score: Math.max(-100, Math.min(100, Math.round(score + (r() - 0.5) * 30))),
            share: Math.round((raw[i] / sum) * 100) / 100,
          })),
          keywords: sc.keywords,
          isSample: true,
        });
      }
    }

    /* a little activity history */
    const recent = [...ARTICLES].filter((a) => !a.unpublished).sort((x, y) => x.ago - y.ago).slice(0, 6);
    for (const a of recent) {
      const info = articleIds.get(a.key)!;
      await tx.insert(s.activityLog).values({
        at: info.publishedAt,
        actorId: a.editor ? staffIds.get(a.editor)! : null,
        kind: "publish",
        entityType: "article",
        entityId: info.id,
        summary: `발행: ${a.title}`,
        meta: { sample: true, slug: info.slug },
      });
    }

    return {
      slugs: [...before.map((r) => r.slug), ...[...articleIds.values()].map((x) => x.slug)],
      storyIds: [...beforeStories.map((r) => r.id), ...storyIds.values()],
    };
  });

  const [c] = await db.execute<{ a: number; c: number; i: number; s: number }>(sql`select
    (select count(*) from articles)::int as a, (select count(*) from candidates)::int as c,
    (select count(*) from feed_items)::int as i, (select count(*) from feed_sources)::int as s`);
  console.log(`✓ seeded — articles ${c.a}, candidates ${c.c}, feed items ${c.i}, sources ${c.s}`);
  await revalidateLive([...ALL_LIST_TAGS, ...touched.slugs.map(T.article), ...touched.storyIds.map(T.story)]);
}

main()
  .catch((err) => {
    console.error("✗ seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
