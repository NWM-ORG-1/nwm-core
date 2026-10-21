CREATE TABLE "ingest_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" uuid,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"http_status" smallint,
	"seen" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"error" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_metrics" (
	"metric" text NOT NULL,
	"symbol" text NOT NULL,
	"source" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "market_metrics_metric_symbol_source_at_pk" PRIMARY KEY("metric","symbol","source","at")
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"author" text,
	"text" text,
	"lang" text DEFAULT 'ko' NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"engagement" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assets" text[] DEFAULT '{}'::text[] NOT NULL,
	"llm_ok" boolean DEFAULT true NOT NULL,
	"stance" real,
	"label" text,
	"scored_by" text,
	"scored_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "feed_sources" ADD COLUMN "next_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_sources" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_sources" ADD COLUMN "last_success_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "feed_sources" ADD COLUMN "fail_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_sources" ADD COLUMN "state" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_sources" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_sources" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sentiment_snapshots" ADD COLUMN "components" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sentiment_snapshots" ADD COLUMN "confidence" real;--> statement-breakpoint
ALTER TABLE "sentiment_snapshots" ADD COLUMN "method" text DEFAULT 'sample' NOT NULL;--> statement-breakpoint
ALTER TABLE "sentiment_snapshots" ADD COLUMN "shadow" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_source_id_feed_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."feed_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_source_id_feed_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."feed_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_runs_source_idx" ON "ingest_runs" USING btree ("source_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ingest_runs_job_idx" ON "ingest_runs" USING btree ("job","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "market_metrics_at_idx" ON "market_metrics" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_posts_source_external_uq" ON "social_posts" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "social_posts_posted_idx" ON "social_posts" USING btree ("posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "social_posts_unscored_idx" ON "social_posts" USING btree ("fetched_at") WHERE scored_at is null;