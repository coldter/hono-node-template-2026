ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_id_users_id_fkey";--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" varchar(255);--> statement-breakpoint
ALTER TABLE "audit_logs" ALTER COLUMN "actor_type" SET DEFAULT 'USER';--> statement-breakpoint
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs" ("organization_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_type_check" CHECK ("actor_type" IN ('USER', 'GLOBAL_ADMIN', 'SYSTEM'));