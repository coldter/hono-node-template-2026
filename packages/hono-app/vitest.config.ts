import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/__tests__/**/*.{test,spec}.ts"],
    exclude: ["node_modules"],
  },
});
