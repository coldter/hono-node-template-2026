ALTER TABLE "sessions" ADD COLUMN "current_jti" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "current_jti_exp" timestamp with time zone;