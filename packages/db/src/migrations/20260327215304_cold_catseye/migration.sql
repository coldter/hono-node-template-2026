CREATE TABLE "audit_logs" (
	"id" varchar(255) PRIMARY KEY,
	"event" text NOT NULL,
	"actor_id" varchar(255),
	"actor_type" text DEFAULT 'user' NOT NULL,
	"target_id" varchar(255),
	"target_type" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" varchar(255) PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" varchar(255) NOT NULL,
	"platform" text DEFAULT 'web'
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" varchar(255) PRIMARY KEY,
	"user_id" varchar(255) NOT NULL,
	"secret" text,
	"backup_codes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" varchar(255),
	"deactivated_reason" text,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"role_slugs" text[] DEFAULT '{}'::text[] NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"two_factor_enabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" varchar(255) PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" varchar(255) PRIMARY KEY,
	"user_id" varchar(255) NOT NULL,
	"type_pattern" varchar(100) NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(255) PRIMARY KEY,
	"user_id" varchar(255) NOT NULL,
	"type" varchar(100) NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"subject" text,
	"body" text,
	"provider_message_id" varchar(255),
	"error_message" text,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" varchar(255) PRIMARY KEY,
	"user_id" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_id" varchar(255),
	"device_name" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(255) PRIMARY KEY,
	"name" varchar(32) NOT NULL UNIQUE,
	"slug" varchar(32) NOT NULL UNIQUE,
	"description" text,
	"permissions" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "audit_logs_event_idx" ON "audit_logs" ("event");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs" ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" ("target_id","target_type");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_user_id_idx" ON "two_factors" ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" ("identifier");--> statement-breakpoint
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_type_idx" ON "notification_preferences" ("user_id","type_pattern");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" ("type");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" ("status");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" ("created_at");--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX "push_tokens_session_id_idx" ON "push_tokens" ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_idx" ON "push_tokens" ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_active_idx" ON "push_tokens" ("is_active");--> statement-breakpoint
CREATE INDEX "roles_slug_idx" ON "roles" ("slug");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_session_id_sessions_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE;