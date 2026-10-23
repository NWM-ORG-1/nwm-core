CREATE TYPE "public"."desk_decision" AS ENUM('draft', 'hold', 'skip');--> statement-breakpoint
CREATE TABLE "desk_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_ids" uuid[] NOT NULL,
	"beat" "beat",
	"topic" text DEFAULT '' NOT NULL,
	"angle" text DEFAULT '' NOT NULL,
	"decision" "desk_decision" NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"scores" jsonb NOT NULL,
	"low_risk" boolean DEFAULT false NOT NULL,
	"candidate_id" uuid,
	"drafted_at" timestamp with time zone,
	"model" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desk_playbooks" (
	"version" integer PRIMARY KEY NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" uuid
);
--> statement-breakpoint
CREATE TABLE "desk_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"trigger" text DEFAULT 'schedule' NOT NULL,
	"items_seen" integer DEFAULT 0 NOT NULL,
	"stories" integer DEFAULT 0 NOT NULL,
	"drafted" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"note" text,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "article_stats_daily" ADD COLUMN "views_search" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_stats_daily" ADD COLUMN "views_social" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_stats_daily" ADD COLUMN "views_direct" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_stats_daily" ADD COLUMN "views_internal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_stats_daily" ADD COLUMN "views_other" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "feed_items" ADD COLUMN "desk_decision_id" uuid;--> statement-breakpoint
ALTER TABLE "desk_decisions" ADD CONSTRAINT "desk_decisions_run_id_desk_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."desk_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desk_decisions" ADD CONSTRAINT "desk_decisions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desk_playbooks" ADD CONSTRAINT "desk_playbooks_created_by_id_staff_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desk_decisions_at_idx" ON "desk_decisions" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "desk_decisions_candidate_idx" ON "desk_decisions" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "desk_runs_started_idx" ON "desk_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_desk_decision_id_desk_decisions_id_fk" FOREIGN KEY ("desk_decision_id") REFERENCES "public"."desk_decisions"("id") ON DELETE set null ON UPDATE no action;