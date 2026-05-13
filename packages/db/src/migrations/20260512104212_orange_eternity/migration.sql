ALTER TABLE "organization" DROP CONSTRAINT "organization_slug_key";--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "enforce_sso" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "session_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "branding" jsonb DEFAULT '{"logoVersion":0,"primaryColor":"#2563eb","appName":"App"}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_live_idx" ON "organization" ("slug") WHERE "deleted_at" IS NULL;