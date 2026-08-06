CREATE TABLE "channel_memberships" (
	"user_id" uuid NOT NULL,
	"channel_id" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_memberships_user_id_channel_id_pk" PRIMARY KEY("user_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "revoked_oidc_sessions" (
	"oidc_issuer" text NOT NULL,
	"oidc_session_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revoked_oidc_sessions_oidc_issuer_oidc_session_id_pk" PRIMARY KEY("oidc_issuer","oidc_session_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"oidc_issuer" text NOT NULL,
	"oidc_subject" text NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"actor_type" varchar(32) DEFAULT 'human' NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_memberships" ADD CONSTRAINT "channel_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_memberships_channel_idx" ON "channel_memberships" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "revoked_oidc_sessions_expiry_idx" ON "revoked_oidc_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_oidc_identity_uidx" ON "users" USING btree ("oidc_issuer","oidc_subject");