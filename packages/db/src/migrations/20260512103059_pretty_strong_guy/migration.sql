CREATE TABLE "tenant_custom_hostnames" (
	"id" varchar(255) PRIMARY KEY,
	"organization_id" text NOT NULL,
	"hostname" text NOT NULL UNIQUE,
	"lifecycle_status" text DEFAULT 'pending_txt' NOT NULL,
	"caddy_cert_storage_key" text,
	"verification_token" text NOT NULL,
	"verification_verified_at" timestamp with time zone,
	"verification_errors" jsonb DEFAULT '[]' NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"last_handshake_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tch_lifecycle_status_check" CHECK ("lifecycle_status" IN ('pending_txt','awaiting_caddy','active','failed','removing','removed'))
);
--> statement-breakpoint
CREATE INDEX "tch_organization_id_idx" ON "tenant_custom_hostnames" ("organization_id");--> statement-breakpoint
CREATE INDEX "tch_status_reconciled_idx" ON "tenant_custom_hostnames" ("lifecycle_status","last_reconciled_at");--> statement-breakpoint
ALTER TABLE "tenant_custom_hostnames" ADD CONSTRAINT "tenant_custom_hostnames_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;