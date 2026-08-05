CREATE TABLE "messages" (
	"sequence" serial PRIMARY KEY NOT NULL,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"client_message_id" uuid NOT NULL,
	"channel_id" varchar(64) NOT NULL,
	"author_id" varchar(64) NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "messages_author_client_message_uidx" ON "messages" USING btree ("author_id","client_message_id");--> statement-breakpoint
CREATE INDEX "messages_channel_sequence_idx" ON "messages" USING btree ("channel_id","sequence");