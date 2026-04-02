import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      (process.env.NODE_ENV === "test"
        ? process.env.DATABASE_TEST_URL
        : process.env.DATABASE_URL || "") || "",
  },
});
