CREATE TABLE "desk_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'ai' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_feedback" (
	"candidate_id" uuid PRIMARY KEY NOT NULL,
	"beat" "beat" NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"ai_draft" jsonb NOT NULL,
	"final_draft" jsonb,
	"instructions" text[] DEFAULT '{}'::text[] NOT NULL,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"distilled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "draft_feedback" ADD CONSTRAINT "draft_feedback_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_feedback_pending_idx" ON "draft_feedback" USING btree ("outcome","distilled_at");