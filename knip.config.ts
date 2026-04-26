import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  tags: ["-lintignore"],
  ignoreIssues: {
    "apps/web/src/modules/ui/**": ["exports"],
    "packages/authorization/package.json": ["optionalPeerDependencies"],
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
      entry: ["src/routes/**/*.tsx", "src/api-config.ts"],
      project: ["src/**/*.{ts,tsx}", "*.{ts,tsx}"],
      ignore: ["src/api.gen/**"],
      ignoreDependencies: [
        "postcss",
        "react-grab",
        "tailwindcss",
        "tw-animate-css",
      ],
      paths: {
        "@/*": ["./src/*"],
      },
    },
    "apps/server": {
      entry: ["scripts/**/*.ts", "mocks/**/*.ts", "tests/**/*.ts"],
      project: [
        "src/**/*.ts",
        "scripts/**/*.ts",
        "mocks/**/*.ts",
        "tests/**/*.ts",
        "*.ts",
      ],
      ignore: ["src/middlewares/**", "src/db/schema/**", "src/lib/**"],
      ignoreFiles: ["src/rcp-client.ts"],
      paths: {
        "@/*": ["./src/*"],
      },
    },
    "packages/*": {
      project: ["**/*.{ts,tsx}"],
    },
    "packages/email": {
      ignoreDependencies: ["@react-email/ui"],
    },
  },
};

export default config;
