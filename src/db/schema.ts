import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Block, Draft, SentimentSnapshot, SourceRef } from "@/lib/content/blocks";

/* ───────────────────────────── enums ───────────────────────────── */

export const beatEnum = pgEnum("beat", ["ai", "crypto", "economy", "tech", "sentiment"]);
/** Only hook for the (on-hold) English Pro edition. */
export const editionEnum = pgEnum("edition", ["ko", "en"]);
export const aiInvolvementEnum = pgEnum("ai_involvement", ["auto", "ai_draft_edited", "ai_assisted", "human"]);
export const articleStatusEnum = pgEnum("article_status", ["published", "unpublished"]);
export const candidateStatusEnum = pgEnum("candidate_status", [
  "new",
  "drafting",
  "review",
  "scheduled",
  "published",
  "rejected",
]);
/** (a) feed_draft — AI draft from feed items · (b) data_auto — code template from data · (c) editor_idea — AI-assisted idea */
export const candidateModeEnum = pgEnum("candidate_mode", ["feed_draft", "data_auto", "editor_idea"]);
export const sourceKindEnum = pgEnum("source_kind", ["rss", "api", "ws", "scrape", "press_pdf", "manual"]);
export const sourceStatusEnum = pgEnum("source_status", ["active", "paused", "error"]);
export const feedItemStatusEnum = pgEnum("feed_item_status", ["new", "promoted", "dismissed"]);
export const experimentStatusEnum = pgEnum("experiment_status", ["draft", "running", "paused", "concluded"]);
export const staffRoleEnum = pgEnum("staff_role", ["admin", "editor"]);
export const storyStatusEnum = pgEnum("story_status", ["developing", "settled"]);
export const correctionKindEnum = pgEnum("correction_kind", ["correction", "clarification", "update"]);
export const correctionRequestStatusEnum = pgEnum("correction_request_status", ["open", "accepted", "rejected"]);

export type Beat = (typeof beatEnum.enumValues)[number];
export type AiInvolvement = (typeof aiInvolvementEnum.enumValues)[number];
export type CandidateStatus = (typeof candidateStatusEnum.enumValues)[number];
export type CandidateMode = (typeof candidateModeEnum.enumValues)[number];
export type SourceKind = (typeof sourceKindEnum.enumValues)[number];
export type SourceStatus = (typeof sourceStatusEnum.enumValues)[number];
export type FeedItemStatus = (typeof feedItemStatusEnum.enumValues)[number];

/* ─────────────────────────── shared JSON types ─────────────────────────── */

export type CheckId = "format" | "sources" | "license" | "ai_label" | "legal" | "numbers" | "brevity" | "duplicate";
export interface CheckResult {
  id: CheckId;
  ok: boolean;
  blocking: boolean;
  message: string;
  overridden?: { by: string; reason: string; at: string };
}

export interface GeneratorMeta {
  id: string; // "mock-1", later "claude-…"
  version: string;
  generatedAt: string;
  inputItemIds: string[];
}

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ───────────────────────────── people ───────────────────────────── */

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  login: text("login").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull().default(""),
  bio: text("bio").notNull().default(""),
  role: staffRoleEnum("role").notNull().default("editor"),
  active: boolean("active").notNull().default(true),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/* ───────────────────────────── feeds ───────────────────────────── */

export const experiments = pgTable("experiments", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(), // "H1"
  name: text("name").notNull(),
  hypothesis: text("hypothesis").notNull().default(""),
  primaryMetric: text("primary_metric").notNull().default("publish_rate"),
  status: experimentStatusEnum("status").notNull().default("running"),
  colorSlot: smallint("color_slot").notNull().default(1), // 1–4 → validated chart palette
  notes: text("notes").notNull().default(""),
  startedAt: ts("started_at"),
  endedAt: ts("ended_at"),
  isSample: boolean("is_sample").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const feedSources = pgTable(
  "feed_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: sourceKindEnum("kind").notNull(),
    url: text("url"),
    beats: beatEnum("beats").array().notNull().default(sql`'{}'::beat[]`),
    lang: text("lang").notNull().default("ko"),
    status: sourceStatusEnum("status").notNull().default("active"),
    experimentId: uuid("experiment_id").references(() => experiments.id, { onDelete: "set null" }),
    /** Phase-2 adapter key, e.g. "dart.list", "ecos.series", "rss". */
    adapter: text("adapter").notNull().default("manual"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** Names of env vars holding credentials — never the secrets themselves. */
    auth: jsonb("auth").$type<{ envVars?: string[] }>().notNull().default({}),
    rateLimit: jsonb("rate_limit").$type<{ perMinute?: number; perDay?: number }>().notNull().default({}),
    pollIntervalSec: integer("poll_interval_sec").notNull().default(600),
    /** 1 official/primary · 2 reputable · 3 community · 4 unverified */
    trustTier: smallint("trust_tier").notNull().default(2),
    /** Signal only: may trigger a look at primary sources, never rewritten or quoted. */
    signalOnly: boolean("signal_only").notNull().default(false),
    licCommercialOk: boolean("lic_commercial_ok"),
    licRedistributionOk: boolean("lic_redistribution_ok"),
    licVerbatimOk: boolean("lic_verbatim_ok"),
    licAttribution: text("lic_attribution"),
    licRetentionDays: integer("lic_retention_days"),
    licTermsUrl: text("lic_terms_url"),
    licReviewedAt: ts("lic_reviewed_at"),
    licReviewedBy: text("lic_reviewed_by"),
    lastFetchedAt: ts("last_fetched_at"),
    lastError: text("last_error"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("feed_sources_experiment_idx").on(t.experimentId)],
);

export const feedItems = pgTable(
  "feed_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => feedSources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    contentHash: text("content_hash").notNull(),
    url: text("url"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    lang: text("lang").notNull().default("ko"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    entities: text("entities").array().notNull().default(sql`'{}'::text[]`),
    beatGuess: beatEnum("beat_guess"),
    score: smallint("score").notNull().default(0),
    status: feedItemStatusEnum("status").notNull().default("new"),
    dismissedReason: text("dismissed_reason"),
    publishedAt: ts("published_at"),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    expiresAt: ts("expires_at"),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [
    uniqueIndex("feed_items_source_external_uq").on(t.sourceId, t.externalId),
    index("feed_items_status_fetched_idx").on(t.status, t.fetchedAt.desc()),
    index("feed_items_hash_idx").on(t.contentHash),
    index("feed_items_source_fetched_idx").on(t.sourceId, t.fetchedAt.desc()),
  ],
);

/* ───────────────────────────── stories ───────────────────────────── */

export const stories = pgTable(
  "stories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    beat: beatEnum("beat").notNull(),
    edition: editionEnum("edition").notNull().default("ko"),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: storyStatusEnum("status").notNull().default("developing"),
    lastPublishedAt: ts("last_published_at"),
    articleCount: integer("article_count").notNull().default(0),
    featuredUntil: ts("featured_until"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("stories_beat_last_idx").on(t.beat, t.lastPublishedAt.desc())],
);

/* ───────────────────────────── candidates ───────────────────────────── */

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: candidateStatusEnum("status").notNull().default("new"),
    mode: candidateModeEnum("mode").notNull(),
    beat: beatEnum("beat").notNull(),
    edition: editionEnum("edition").notNull().default("ko"),
    priority: smallint("priority").notNull().default(50),
    idea: text("idea"),
    experimentId: uuid("experiment_id").references(() => experiments.id, { onDelete: "set null" }),
    storyId: uuid("story_id").references(() => stories.id, { onDelete: "set null" }),
    draft: jsonb("draft").$type<Draft>().notNull(),
    checks: jsonb("checks").$type<CheckResult[]>().notNull().default([]),
    aiNote: text("ai_note"),
    generator: jsonb("generator").$type<GeneratorMeta | null>(),
    assigneeId: uuid("assignee_id").references(() => staff.id, { onDelete: "set null" }),
    scheduledAt: ts("scheduled_at"),
    /** the editor who scheduled it — becomes the named editor when the scheduler publishes */
    scheduledById: uuid("scheduled_by_id").references(() => staff.id, { onDelete: "set null" }),
    articleId: uuid("article_id"),
    lockVersion: integer("lock_version").notNull().default(0),
    seedKey: text("seed_key").unique(),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("candidates_status_updated_idx").on(t.status, t.updatedAt.desc()),
    index("candidates_experiment_idx").on(t.experimentId),
    index("candidates_scheduled_idx").on(t.scheduledAt).where(sql`${t.status} = 'scheduled'`),
  ],
);

export const candidateItems = pgTable(
  "candidate_items",
  {
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    feedItemId: uuid("feed_item_id")
      .notNull()
      .references(() => feedItems.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("supporting"), // primary | supporting
  },
  (t) => [primaryKey({ columns: [t.candidateId, t.feedItemId] })],
);

/* ───────────────────────────── articles ───────────────────────────── */

export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(), // yyMMdd-xxxxxx
    edition: editionEnum("edition").notNull().default("ko"),
    beat: beatEnum("beat").notNull(),
    storyId: uuid("story_id").references(() => stories.id, { onDelete: "set null" }),
    candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "set null" }),
    experimentId: uuid("experiment_id").references(() => experiments.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    dek: text("dek").notNull(),
    blocks: jsonb("blocks").$type<Block[]>().notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    tickers: text("tickers").array().notNull().default(sql`'{}'::text[]`),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
    sentiment: jsonb("sentiment").$type<SentimentSnapshot | null>(),
    aiInvolvement: aiInvolvementEnum("ai_involvement").notNull(),
    generator: jsonb("generator").$type<GeneratorMeta | null>(),
    authorId: uuid("author_id").references(() => staff.id, { onDelete: "set null" }),
    editorId: uuid("editor_id").references(() => staff.id, { onDelete: "set null" }),
    byline: text("byline").notNull(),
    status: articleStatusEnum("status").notNull().default("published"),
    isBreaking: boolean("is_breaking").notNull().default(false),
    featuredUntil: ts("featured_until"),
    readSeconds: integer("read_seconds").notNull().default(30),
    revision: integer("revision").notNull().default(1),
    publishedAt: ts("published_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [
    index("articles_published_idx").on(t.publishedAt.desc()).where(sql`${t.status} = 'published'`),
    index("articles_beat_published_idx").on(t.beat, t.publishedAt.desc()).where(sql`${t.status} = 'published'`),
    index("articles_story_idx").on(t.storyId, t.publishedAt.desc()),
    index("articles_tags_gin").using("gin", t.tags),
    // AI-drafted or AI-assisted pieces must name a human editor.
    check(
      "articles_editor_required",
      sql`${t.aiInvolvement} IN ('auto', 'human') OR ${t.editorId} IS NOT NULL`,
    ),
  ],
);

export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    dek: text("dek").notNull(),
    blocks: jsonb("blocks").$type<Block[]>().notNull(),
    sources: jsonb("sources").$type<SourceRef[]>().notNull().default([]),
    editedBy: uuid("edited_by").references(() => staff.id, { onDelete: "set null" }),
    reason: text("reason").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("article_revisions_uq").on(t.articleId, t.revision)],
);

export const articleCorrections = pgTable(
  "article_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    kind: correctionKindEnum("kind").notNull().default("correction"),
    note: text("note").notNull(), // public
    createdBy: uuid("created_by").references(() => staff.id, { onDelete: "set null" }),
    publishedAt: ts("published_at").notNull().defaultNow(),
  },
  (t) => [index("article_corrections_article_idx").on(t.articleId)],
);

/** 언론중재법: correction requests must be answered within 3 days and published within 7. */
export const correctionRequests = pgTable(
  "correction_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    receivedAt: ts("received_at").notNull().defaultNow(),
    requester: text("requester").notNull(),
    channel: text("channel").notNull().default("email"),
    claim: text("claim").notNull(),
    status: correctionRequestStatusEnum("status").notNull().default("open"),
    resolvedAt: ts("resolved_at"),
    correctionId: uuid("correction_id").references(() => articleCorrections.id, { onDelete: "set null" }),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [index("correction_requests_status_idx").on(t.status, t.receivedAt)],
);

export const articleStatsDaily = pgTable(
  "article_stats_daily",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(), // KST date
    views: integer("views").notNull().default(0),
    reads: integer("reads").notNull().default(0),
    nexts: integer("nexts").notNull().default(0),
    dwellMs: bigint("dwell_ms", { mode: "number" }).notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.day] }), index("article_stats_day_idx").on(t.day)],
);

/* ───────────────────────────── market & sentiment ───────────────────────────── */

export const marketQuotes = pgTable("market_quotes", {
  symbol: text("symbol").primaryKey(),
  name: text("name").notNull(),
  price: doublePrecision("price").notNull(),
  changePct: doublePrecision("change_pct").notNull(),
  currency: text("currency").notNull().default(""),
  spark: real("spark").array().notNull().default(sql`'{}'::real[]`),
  sort: smallint("sort").notNull().default(0),
  inTicker: boolean("in_ticker").notNull().default(false),
  asOf: ts("as_of").notNull().defaultNow(),
  source: text("source").notNull().default("mock"),
});

export const sentimentSnapshots = pgTable(
  "sentiment_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scopeKey: text("scope_key").notNull(), // "index" | "asset:BTC"
    label: text("label").notNull().default(""), // display name for assets
    at: ts("at").notNull(),
    score: real("score").notNull(),
    change24h: real("change_24h").notNull().default(0),
    bullish: real("bullish").notNull().default(0),
    bearish: real("bearish").notNull().default(0),
    volume: integer("volume").notNull().default(0),
    sources: jsonb("sources").$type<SentimentSnapshot["sources"]>().notNull().default([]),
    keywords: text("keywords").array().notNull().default(sql`'{}'::text[]`),
    isSample: boolean("is_sample").notNull().default(false),
  },
  (t) => [index("sentiment_scope_at_idx").on(t.scopeKey, t.at.desc())],
);

/* ───────────────────────────── ops ───────────────────────────── */

export const activityLog = pgTable(
  "activity_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => staff.id, { onDelete: "set null" }), // null = system
    kind: text("kind").notNull(), // ingest | promote | dismiss | draft | publish | schedule | unpublish | correct | source | experiment | settings
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index("activity_at_idx").on(t.at.desc()), index("activity_entity_idx").on(t.entityType, t.entityId, t.at.desc())],
);

export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ───────────────────────────── relations ───────────────────────────── */

export const articlesRelations = relations(articles, ({ one, many }) => ({
  story: one(stories, { fields: [articles.storyId], references: [stories.id] }),
  editor: one(staff, { fields: [articles.editorId], references: [staff.id], relationName: "editor" }),
  author: one(staff, { fields: [articles.authorId], references: [staff.id], relationName: "author" }),
  corrections: many(articleCorrections),
  revisions: many(articleRevisions),
}));

export const storiesRelations = relations(stories, ({ many }) => ({ articles: many(articles) }));

export const staffRelations = relations(staff, ({ many }) => ({
  edited: many(articles, { relationName: "editor" }),
  authored: many(articles, { relationName: "author" }),
}));

export const articleCorrectionsRelations = relations(articleCorrections, ({ one }) => ({
  article: one(articles, { fields: [articleCorrections.articleId], references: [articles.id] }),
}));

export const articleRevisionsRelations = relations(articleRevisions, ({ one }) => ({
  article: one(articles, { fields: [articleRevisions.articleId], references: [articles.id] }),
}));

export const feedSourcesRelations = relations(feedSources, ({ one, many }) => ({
  experiment: one(experiments, { fields: [feedSources.experimentId], references: [experiments.id] }),
  items: many(feedItems),
}));

export const feedItemsRelations = relations(feedItems, ({ one }) => ({
  source: one(feedSources, { fields: [feedItems.sourceId], references: [feedSources.id] }),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  experiment: one(experiments, { fields: [candidates.experimentId], references: [experiments.id] }),
  story: one(stories, { fields: [candidates.storyId], references: [stories.id] }),
  assignee: one(staff, { fields: [candidates.assigneeId], references: [staff.id] }),
  items: many(candidateItems),
}));

export const candidateItemsRelations = relations(candidateItems, ({ one }) => ({
  candidate: one(candidates, { fields: [candidateItems.candidateId], references: [candidates.id] }),
  item: one(feedItems, { fields: [candidateItems.feedItemId], references: [feedItems.id] }),
}));

export const experimentsRelations = relations(experiments, ({ many }) => ({ sources: many(feedSources) }));
