ALTER TABLE "roles" DROP CONSTRAINT "roles_name_key";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_slug_key";--> statement-breakpoint
DROP INDEX "roles_slug_idx";--> statement-breakpoint
DROP INDEX "notification_preferences_user_id_idx";--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone USING "expires_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at"::timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" ("created_at");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" ("status");--> statement-breakpoint
CREATE INDEX "users_role_slugs_idx" ON "users" USING gin ("role_slugs");--> statement-breakpoint
CREATE INDEX "invitation_inviter_id_idx" ON "invitation" ("inviter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_org_unique" ON "member" ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_unique" ON "roles" ("name") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_slug_unique" ON "roles" ("slug") WHERE "deleted_at" is null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deactivated_by_users_id_fkey" FOREIGN KEY ("deactivated_by") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_type_check" CHECK ("actor_type" in ('user', 'system', 'api'));--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_target_type_check" CHECK ("target_type" is null or "target_type" in ('user', 'role', 'session'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_platform_check" CHECK ("platform" in ('web', 'mobile'));