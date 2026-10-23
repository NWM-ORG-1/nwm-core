import { eq, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { siteSettings } from "@/db/schema";
import { DESK_MODEL_KEY } from "./settings";
import { EMPTY_DESK_MODEL, TRAFFIC_SOURCES, type ArticleBrief, type DeskModel, type DeskPhase, type Effect, type TrafficSource } from "./types";

/**
 * What the desk learns from. No model is trained: every few hours the worker
 * scores each published article on its first three days of reader response,
 * relative to the others, and averages those scores by field, topic, source
 * and publishing hour. Editors' calls on desk drafts (published or rejected)
 * count from the first day; reader data counts only once there is enough of it.
 *
 * Early on there is little traffic and no search traffic, so raw views mostly
 * say how much the site was visited that day. Rates (read to the end, time
 * spent, moving on to another article) say more, and carry more weight until
 * the site has an audience; small samples are pulled toward the average.
 */

export interface ArticleStatRow {
  slug: string;
  title: string;
  beat: string;
  topic: string;
  source: string;
  /** KST hour it was published */
  hour: number;
  views: number;
  reads: number;
  nexts: number;
  dwellMs: number;
}

export interface EditorRow {
  status: "published" | "rejected";
  beat: string;
  topic: string;
}

const PHASE_WEIGHTS: Record<DeskPhase, { read: number; dwell: number; next: number; reach: number }> = {
  cold: { read: 0.45, dwell: 0.25, next: 0.1, reach: 0.2 },
  warming: { read: 0.35, dwell: 0.2, next: 0.1, reach: 0.35 },
  learning: { read: 0.3, dwell: 0.15, next: 0.1, reach: 0.45 },
};

export function hourBucket(h: number): string {
  return h < 7 ? "새벽" : h < 12 ? "오전" : h < 18 ? "오후" : "저녁";
}

function median(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function zscores(a: number[]): number[] {
  if (a.length < 2) return a.map(() => 0);
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
  return sd < 1e-9 ? a.map(() => 0) : a.map((x) => (x - mean) / sd);
}

function groupMeans<T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Record<string, Effect> {
  const acc = new Map<string, { s: number; n: number }>();
  for (const r of rows) {
    const k = key(r).trim();
    if (!k) continue;
    const g = acc.get(k) ?? { s: 0, n: 0 };
    g.s += value(r);
    g.n += 1;
    acc.set(k, g);
  }
  return Object.fromEntries([...acc].map(([k, g]) => [k, { mean: round(g.s / g.n), n: g.n }]));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function phaseOf(measured: number, medianViews: number): { phase: DeskPhase; confidence: number } {
  if (measured < 20 || medianViews < 5) return { phase: "cold", confidence: 0 };
  if (measured < 80) return { phase: "warming", confidence: 0.5 };
  return { phase: "learning", confidence: 1 };
}

export function computeDeskModel(rows: ArticleStatRow[], editor: EditorRow[], traffic: Record<TrafficSource, number>, now: Date): DeskModel {
  const views = rows.reduce((s, r) => s + r.views, 0);
  const R = views ? rows.reduce((s, r) => s + r.reads, 0) / views : 0.3;
  const N = views ? rows.reduce((s, r) => s + r.nexts, 0) / views : 0.1;
  const D = views ? rows.reduce((s, r) => s + r.dwellMs, 0) / 1000 / views : 40;
  const medianViews = median(rows.map((r) => r.views));
  const { phase, confidence } = phaseOf(rows.length, medianViews);
  const w = PHASE_WEIGHTS[phase];

  // rates pulled toward the site average by ~10 views of prior evidence
  const k = 10;
  const read = rows.map((r) => (r.reads + k * R) / (r.views + k));
  const next = rows.map((r) => (r.nexts + k * N) / (r.views + k));
  const dwell = rows.map((r) => (r.dwellMs / 1000 + k * D) / (r.views + k));
  const reach = rows.map((r) => Math.log1p(r.views));
  const [zr, zd, zn, zv] = [zscores(read), zscores(dwell), zscores(next), zscores(reach)];
  const scored = rows.map((r, i) => ({ ...r, readRate: read[i], perf: round(w.read * zr[i] + w.dwell * zd[i] + w.next * zn[i] + w.reach * zv[i]) }));

  const published = editor.filter((e) => e.status === "published").length;
  const G = editor.length ? published / editor.length : 0.5;
  const accept = (e: EditorRow) => (e.status === "published" ? 1 : 0) - G;

  const brief = (a: (typeof scored)[number]): ArticleBrief => ({ slug: a.slug, title: a.title, beat: a.beat, topic: a.topic, perf: a.perf, views: a.views, readRate: round(a.readRate) });
  const ranked = [...scored].sort((a, b) => b.perf - a.perf);
  const showRanks = ranked.length >= 5;

  return {
    computedAt: now.toISOString(),
    phase,
    confidence,
    measured: rows.length,
    medianViews,
    readRate: round(R),
    traffic,
    reader: {
      beat: groupMeans(scored, (r) => r.beat, (r) => r.perf),
      topic: groupMeans(scored, (r) => r.topic, (r) => r.perf),
      source: groupMeans(scored, (r) => r.source, (r) => r.perf),
      hour: groupMeans(scored, (r) => hourBucket(r.hour), (r) => r.perf),
    },
    editor: {
      total: editor.length,
      published,
      rejected: editor.length - published,
      rate: round(G),
      beat: groupMeans(editor, (e) => e.beat, accept),
      topic: groupMeans(editor, (e) => e.topic, accept),
    },
    top: showRanks ? ranked.slice(0, 8).map(brief) : [],
    bottom: showRanks ? ranked.slice(-8).reverse().map(brief) : [],
  };
}

/* ───────────────────────── database ───────────────────────── */

export async function loadLearningInputs(db: DB): Promise<{ rows: ArticleStatRow[]; editor: EditorRow[]; traffic: Record<TrafficSource, number> }> {
  // first three KST days of each article published 1–60 days ago (samples excluded)
  const rows = await db.execute<{
    slug: string;
    title: string;
    beat: string;
    topic: string;
    source: string;
    hour: number;
    views: number;
    reads: number;
    nexts: number;
    dwell_ms: number;
  }>(sql`
    select a.slug, a.title, a.beat::text as beat,
      coalesce((select d.topic from desk_decisions d where d.candidate_id = a.candidate_id order by d.at desc limit 1), '') as topic,
      coalesce((select s.name from candidate_items ci
                  join feed_items fi on fi.id = ci.feed_item_id
                  join feed_sources s on s.id = fi.source_id
                 where ci.candidate_id = a.candidate_id
                 order by (ci.role = 'primary') desc limit 1), '') as source,
      extract(hour from a.published_at at time zone 'Asia/Seoul')::int as hour,
      coalesce(sum(st.views), 0)::int as views,
      coalesce(sum(st.reads), 0)::int as reads,
      coalesce(sum(st.nexts), 0)::int as nexts,
      coalesce(sum(st.dwell_ms), 0)::float8 as dwell_ms
    from articles a
    left join article_stats_daily st
      on st.article_id = a.id
     and st.day between (a.published_at at time zone 'Asia/Seoul')::date and (a.published_at at time zone 'Asia/Seoul')::date + 2
    where a.status = 'published' and not a.is_sample
      and a.published_at > now() - interval '60 days' and a.published_at < now() - interval '24 hours'
    group by a.id`);
  const editor = await db.execute<{ status: "published" | "rejected"; beat: string | null; topic: string }>(sql`
    select c.status::text as status, d.beat::text as beat, d.topic
    from desk_decisions d join candidates c on c.id = d.candidate_id
    where d.at > now() - interval '60 days' and c.status in ('published', 'rejected')`);
  const [t] = await db.execute<Record<string, number>>(sql`
    select coalesce(sum(views_search), 0)::int as search, coalesce(sum(views_social), 0)::int as social,
           coalesce(sum(views_direct), 0)::int as direct, coalesce(sum(views_internal), 0)::int as internal,
           coalesce(sum(views_other), 0)::int as other
    from article_stats_daily where day > (now() at time zone 'Asia/Seoul')::date - 30`);
  const traffic = Object.fromEntries(TRAFFIC_SOURCES.map((s) => [s, Number(t?.[s] ?? 0)])) as Record<TrafficSource, number>;
  return {
    rows: rows.map((r) => ({ slug: r.slug, title: r.title, beat: r.beat, topic: r.topic, source: r.source, hour: Number(r.hour), views: Number(r.views), reads: Number(r.reads), nexts: Number(r.nexts), dwellMs: Number(r.dwell_ms) })),
    editor: editor.map((e) => ({ status: e.status, beat: e.beat ?? "", topic: e.topic })),
    traffic,
  };
}

export async function refreshDeskModel(db: DB, now = new Date()): Promise<DeskModel> {
  const { rows, editor, traffic } = await loadLearningInputs(db);
  const model = computeDeskModel(rows, editor, traffic, now);
  await db
    .insert(siteSettings)
    .values({ key: DESK_MODEL_KEY, value: model })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: model, updatedAt: now } });
  return model;
}

export async function loadDeskModel(db: Pick<DB, "query">): Promise<DeskModel> {
  const row = await db.query.siteSettings.findFirst({ where: eq(siteSettings.key, DESK_MODEL_KEY) });
  const v = row?.value as Partial<DeskModel> | undefined;
  if (!v || typeof v !== "object" || !v.reader || !v.editor) return EMPTY_DESK_MODEL;
  return { ...EMPTY_DESK_MODEL, ...v, reader: { ...EMPTY_DESK_MODEL.reader, ...v.reader }, editor: { ...EMPTY_DESK_MODEL.editor, ...v.editor } } as DeskModel;
}
