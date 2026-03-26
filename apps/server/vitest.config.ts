import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    env: {
      SKIP_ENV_VALIDATION: "true",
      SKIP_DB: "true",
    },
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: "threads",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/", "src/db/migrations/", "**/*.d.ts"],
    },
    isolate: true,
  },
});
