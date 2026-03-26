import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      (process.env.NODE_ENV === "test"
        ? process.env.DATABASE_TEST_URL
        : process.env.DATABASE_URL || "") || "",
  },
});
