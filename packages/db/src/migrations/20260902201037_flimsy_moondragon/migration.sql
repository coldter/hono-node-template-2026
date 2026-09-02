ALTER TABLE "push_tokens" ALTER COLUMN "session_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_tokens" DROP CONSTRAINT "push_tokens_session_id_sessions_id_fkey", ADD CONSTRAINT "push_tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK ("status" IN ('active', 'inactive', 'locked', 'deleted'));--> statement-breakpoint
UPDATE "users" SET "two_factor_enabled" = true WHERE "id" IN (SELECT "user_id" FROM "two_factors");
