import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  rules: {
    exports: "off",
    types: "off",
  },
  tags: ["-lintignore"],
  workspaces: {
    "apps/server": {
      entry: ["scripts/**/*.ts", "mocks/**/*.ts", "tests/**/*.ts"],
      paths: {
        "@/*": ["./src/*"],
      },
      project: [
        "src/**/*.ts",
        "scripts/**/*.ts",
        "mocks/**/*.ts",
        "tests/**/*.ts",
        "*.ts",
      ],
    },
    "apps/web": {
      entry: ["src/routes/**/*.tsx", "src/api-config.ts"],
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
      project: ["src/**/*.{ts,tsx}", "*.{ts,tsx}"],
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
