CREATE TABLE "tenant_cache_version" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"version" text DEFAULT '0' NOT NULL,
	CONSTRAINT "single_row" CHECK ("id" = 1)
);
