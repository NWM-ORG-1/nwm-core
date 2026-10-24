CREATE TABLE "telegram_links" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"tg_user_id" bigint,
	"chat_id" bigint,
	"tg_username" text,
	"linked_at" timestamp with time zone,
	"notify" boolean DEFAULT true NOT NULL,
	CONSTRAINT "telegram_links_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "telegram_links_tg_user_id_unique" UNIQUE("tg_user_id")
);
--> statement-breakpoint
CREATE TABLE "telegram_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid,
	"chat_id" bigint NOT NULL,
	"message_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"lock_version" integer,
	"state" text DEFAULT 'open' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_messages_chat_msg_uq" ON "telegram_messages" USING btree ("chat_id","message_id");--> statement-breakpoint
CREATE INDEX "telegram_messages_candidate_idx" ON "telegram_messages" USING btree ("candidate_id");