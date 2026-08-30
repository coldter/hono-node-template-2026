import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dbCredentials: {
    url:
      (process.env.NODE_ENV === "test"
        ? process.env.DATABASE_TEST_URL
        : process.env.DATABASE_URL || "") || "",
  },
  dialect: "postgresql",
  out: "../../packages/db/src/migrations",
  schema: "../../packages/db/src/schema/index.ts",
});
