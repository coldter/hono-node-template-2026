import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    coverage: {
      exclude: [
        "node_modules/",
        "tests/",
        "../../packages/db/src/migrations/",
        "**/*.d.ts",
      ],
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    env: {
      SKIP_DB: "true",
      SKIP_ENV_VALIDATION: "true",
    },
    environment: "node",
    exclude: ["node_modules", "dist"],
    globals: false,
    hookTimeout: 10_000,
    include: ["tests/**/*.test.ts"],
    isolate: true,
    pool: "threads",
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 10_000,
  },
});
