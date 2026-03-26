import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  tags: ["-lintignore"],
  ignoreIssues: {
    "apps/web/src/modules/ui/**": ["exports"],
  },
  rules: {
    exports: "warn",
    types: "warn",
  },
  workspaces: {
    ".": {
      ignoreDependencies: ["tsx"],
    },
    "apps/web": {
      entry: [
        "src/main.tsx",
        "vite.config.ts",
        "src/routes/**/*.tsx",
        "openapi-ts.config.ts",
        "src/api-config.ts",
      ],
      project: ["src/**/*.{ts,tsx}", "*.{ts,tsx}"],
      ignore: ["src/routeTree.gen.ts", "src/api.gen/**"],
      ignoreDependencies: ["postcss", "tailwindcss", "tw-animate-css"],
      paths: {
        "@/*": ["./src/*"],
      },
    },
    "apps/server": {
      entry: ["src/index.ts", "drizzle.config.ts"],
      project: ["src/**/*.ts", "*.ts"],
      ignore: ["src/middlewares/**", "src/db/schema/**", "src/lib/**"],
      ignoreFiles: ["src/rcp-client.ts"],
      paths: {
        "@/*": ["./src/*"],
      },
    },
    "packages/*": {
      project: "**/*.ts",
    },
  },
};

export default config;
