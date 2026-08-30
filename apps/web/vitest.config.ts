import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    coverage: {
      exclude: [
        "node_modules/",
        "src/__tests__/",
        "src/api.gen/",
        "src/routeTree.gen.ts",
        "**/*.d.ts",
        "**/*.config.*",
      ],
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    environment: "jsdom",
    exclude: ["node_modules", "dist", "src/routeTree.gen.ts", "src/api.gen/**"],
    globals: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/__tests__/setup.tsx"],
  },
});
