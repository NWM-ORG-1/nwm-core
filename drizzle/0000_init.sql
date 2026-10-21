CREATE TYPE "public"."ai_involvement" AS ENUM('auto', 'ai_draft_edited', 'ai_assisted', 'human');--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('published', 'unpublished');--> statement-breakpoint
CREATE TYPE "public"."beat" AS ENUM('ai', 'crypto', 'economy', 'tech', 'sentiment');--> statement-breakpoint
CREATE TYPE "public"."candidate_mode" AS ENUM('feed_draft', 'data_auto', 'editor_idea');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('new', 'drafting', 'review', 'scheduled', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."correction_kind" AS ENUM('correction', 'clarification', 'update');--> statement-breakpoint
CREATE TYPE "public"."correction_request_status" AS ENUM('open', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."edition" AS ENUM('ko', 'en');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('draft', 'running', 'paused', 'concluded');--> statement-breakpoint
CREATE TYPE "public"."feed_item_status" AS ENUM('new', 'promoted', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('rss', 'api', 'ws', 'scrape', 'press_pdf', 'manual');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('active', 'paused', 'error');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'editor');--> statement-breakpoint
CREATE TYPE "public"."story_status" AS ENUM('developing', 'settled');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"kind" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"summary" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"kind" "correction_kind" DEFAULT 'correction' NOT NULL,
	"note" text NOT NULL,
	"created_by" uuid,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"title" text NOT NULL,
	"dek" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_by" uuid,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_stats_daily" (
	"article_id" uuid NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"reads" integer DEFAULT 0 NOT NULL,
	"nexts" integer DEFAULT 0 NOT NULL,
	"dwell_ms" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "article_stats_daily_article_id_day_pk" PRIMARY KEY("article_id","day")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"edition" "edition" DEFAULT 'ko' NOT NULL,
	"beat" "beat" NOT NULL,
	"story_id" uuid,
	"candidate_id" uuid,
	"experiment_id" uuid,
	"title" text NOT NULL,
	"dek" text NOT NULL,
	"blocks" jsonb NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"tickers" text[] DEFAULT '{}'::text[] NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" jsonb,
	"ai_involvement" "ai_involvement" NOT NULL,
	"generator" jsonb,
	"author_id" uuid,
	"editor_id" uuid,
	"byline" text NOT NULL,
	"status" "article_status" DEFAULT 'published' NOT NULL,
	"is_breaking" boolean DEFAULT false NOT NULL,
	"featured_until" timestamp with time zone,
	"read_seconds" integer DEFAULT 30 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug"),
	CONSTRAINT "articles_editor_required" CHECK ("articles"."ai_involvement" IN ('auto', 'human') OR "articles"."editor_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "candidate_items" (
	"candidate_id" uuid NOT NULL,
	"feed_item_id" uuid NOT NULL,
	"role" text DEFAULT 'supporting' NOT NULL,
	CONSTRAINT "candidate_items_candidate_id_feed_item_id_pk" PRIMARY KEY("candidate_id","feed_item_id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "candidate_status" DEFAULT 'new' NOT NULL,
	"mode" "candidate_mode" NOT NULL,
	"beat" "beat" NOT NULL,
	"edition" "edition" DEFAULT 'ko' NOT NULL,
	"priority" smallint DEFAULT 50 NOT NULL,
	"idea" text,
	"experiment_id" uuid,
	"story_id" uuid,
	"draft" jsonb NOT NULL,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_note" text,
	"generator" jsonb,
	"assignee_id" uuid,
	"scheduled_at" timestamp with time zone,
	"scheduled_by_id" uuid,
	"article_id" uuid,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"seed_key" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_seed_key_unique" UNIQUE("seed_key")
);
--> statement-breakpoint
CREATE TABLE "correction_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"requester" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"claim" text NOT NULL,
	"status" "correction_request_status" DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"correction_id" uuid,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text DEFAULT '' NOT NULL,
	"primary_metric" text DEFAULT 'publish_rate' NOT NULL,
	"status" "experiment_status" DEFAULT 'running' NOT NULL,
	"color_slot" smallint DEFAULT 1 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"lang" text DEFAULT 'ko' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entities" text[] DEFAULT '{}'::text[] NOT NULL,
	"beat_guess" "beat",
	"score" smallint DEFAULT 0 NOT NULL,
	"status" "feed_item_status" DEFAULT 'new' NOT NULL,
	"dismissed_reason" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feed_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "source_kind" NOT NULL,
	"url" text,
	"beats" "beat"[] DEFAULT '{}'::beat[] NOT NULL,
	"lang" text DEFAULT 'ko' NOT NULL,
	"status" "source_status" DEFAULT 'active' NOT NULL,
	"experiment_id" uuid,
	"adapter" text DEFAULT 'manual' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auth" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rate_limit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"poll_interval_sec" integer DEFAULT 600 NOT NULL,
	"trust_tier" smallint DEFAULT 2 NOT NULL,
	"signal_only" boolean DEFAULT false NOT NULL,
	"lic_commercial_ok" boolean,
	"lic_redistribution_ok" boolean,
	"lic_verbatim_ok" boolean,
	"lic_attribution" text,
	"lic_retention_days" integer,
	"lic_terms_url" text,
	"lic_reviewed_at" timestamp with time zone,
	"lic_reviewed_by" text,
	"last_fetched_at" timestamp with time zone,
	"last_error" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "market_quotes" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" double precision NOT NULL,
	"change_pct" double precision NOT NULL,
	"currency" text DEFAULT '' NOT NULL,
	"spark" real[] DEFAULT '{}'::real[] NOT NULL,
	"sort" smallint DEFAULT 0 NOT NULL,
	"in_ticker" boolean DEFAULT false NOT NULL,
	"as_of" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'mock' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sentiment_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_key" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"score" real NOT NULL,
	"change_24h" real DEFAULT 0 NOT NULL,
	"bullish" real DEFAULT 0 NOT NULL,
	"bearish" real DEFAULT 0 NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"role" "staff_role" DEFAULT 'editor' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_login_unique" UNIQUE("login"),
	CONSTRAINT "staff_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"beat" "beat" NOT NULL,
	"edition" "edition" DEFAULT 'ko' NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" "story_status" DEFAULT 'developing' NOT NULL,
	"last_published_at" timestamp with time zone,
	"article_count" integer DEFAULT 0 NOT NULL,
	"featured_until" timestamp with time zone,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_corrections" ADD CONSTRAINT "article_corrections_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_corrections" ADD CONSTRAINT "article_corrections_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_edited_by_staff_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_stats_daily" ADD CONSTRAINT "article_stats_daily_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_editor_id_staff_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_items" ADD CONSTRAINT "candidate_items_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_items" ADD CONSTRAINT "candidate_items_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_assignee_id_staff_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_scheduled_by_id_staff_id_fk" FOREIGN KEY ("scheduled_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_correction_id_article_corrections_id_fk" FOREIGN KEY ("correction_id") REFERENCES "public"."article_corrections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_source_id_feed_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."feed_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_sources" ADD CONSTRAINT "feed_sources_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity_log" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "article_corrections_article_idx" ON "article_corrections" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "article_revisions_uq" ON "article_revisions" USING btree ("article_id","revision");--> statement-breakpoint
CREATE INDEX "article_stats_day_idx" ON "article_stats_daily" USING btree ("day");--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at" DESC NULLS LAST) WHERE "articles"."status" = 'published';--> statement-breakpoint
CREATE INDEX "articles_beat_published_idx" ON "articles" USING btree ("beat","published_at" DESC NULLS LAST) WHERE "articles"."status" = 'published';--> statement-breakpoint
CREATE INDEX "articles_story_idx" ON "articles" USING btree ("story_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_tags_gin" ON "articles" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "candidates_status_updated_idx" ON "candidates" USING btree ("status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "candidates_experiment_idx" ON "candidates" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "candidates_scheduled_idx" ON "candidates" USING btree ("scheduled_at") WHERE "candidates"."status" = 'scheduled';--> statement-breakpoint
CREATE INDEX "correction_requests_status_idx" ON "correction_requests" USING btree ("status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_source_external_uq" ON "feed_items" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "feed_items_status_fetched_idx" ON "feed_items" USING btree ("status","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_items_hash_idx" ON "feed_items" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "feed_items_source_fetched_idx" ON "feed_items" USING btree ("source_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "feed_sources_experiment_idx" ON "feed_sources" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "sentiment_scope_at_idx" ON "sentiment_snapshots" USING btree ("scope_key","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stories_beat_last_idx" ON "stories" USING btree ("beat","last_published_at" DESC NULLS LAST);