CREATE TABLE "sso_providers" (
	"id" varchar(255) PRIMARY KEY,
	"organization_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"issuer" text NOT NULL,
	"domain" text NOT NULL,
	"oidc_config_encrypted" bytea NOT NULL,
	"oidc_config_edek" bytea NOT NULL,
	"kek_version" integer NOT NULL,
	"domain_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sso_org_provider_unique" ON "sso_providers" ("organization_id","provider_id");--> statement-breakpoint
ALTER TABLE "sso_providers" ADD CONSTRAINT "sso_providers_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;