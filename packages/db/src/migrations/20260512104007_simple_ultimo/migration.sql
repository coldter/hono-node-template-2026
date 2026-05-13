CREATE TABLE "global_admins" (
	"id" varchar(255) PRIMARY KEY,
	"user_id" text,
	"email" text NOT NULL UNIQUE,
	"sub_role" text NOT NULL,
	"enrollment_token_hash" bytea,
	"enrollment_expires_at" timestamp with time zone,
	"bound_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_admins_sub_role_check" CHECK ("sub_role" IN ('platform_admin','support','read_only'))
);
--> statement-breakpoint
CREATE TABLE "reserved_slugs" (
	"slug" text PRIMARY KEY,
	"reason" text NOT NULL,
	"organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reserved_slugs_reason_check" CHECK ("reason" IN ('tombstone','platform','operator_denylist'))
);
--> statement-breakpoint
ALTER TABLE "global_admins" ADD CONSTRAINT "global_admins_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "reserved_slugs" ADD CONSTRAINT "reserved_slugs_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE SET NULL;