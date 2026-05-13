import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  tags: ["-lintignore"],
  ignoreIssues: {
    "apps/admin-ui/src/modules/ui/**": ["exports"],
    "packages/authorization/package.json": ["optionalPeerDependencies"],
    // Scaffolding reserved for upcoming admin-ui features:
    //   - `useTableUrlState` will back the operator-facing tenants/audit
    //     listing pages (URL-driven pagination/sorting) once those routes
    //     land in admin-ui. Stories already reference it in documentation.
    //   - The `data-table` and `permissions` barrels exist so feature
    //     modules can `import { ... } from "@/modules/data-table"` without
    //     reaching into individual files. Currently only the stories
    //     consume the underlying components directly.
    "apps/admin-ui/src/hooks/use-table-url-state.ts": ["files"],
    "apps/admin-ui/src/modules/data-table/index.ts": ["files"],
    "apps/admin-ui/src/modules/permissions/index.ts": ["files"],
    // Wire-shape mirrors: each `z.infer<typeof X>` type lives next to its
    // schema so the route handlers and the admin-ui codegen consumer agree
    // on the same TS shape. Knip flags them because consumers reference
    // the schema (validation seam) rather than the mirror type, but
    // removing them would drop the documentation pairing.
    "apps/admin-server/src/modules/enroll/schema.ts": ["types"],
    "apps/admin-server/src/modules/tenants/schema.ts": ["types"],
  },
  rules: {
    exports: "warn",
    types: "warn",
  },
  workspaces: {
    ".": {
      ignoreDependencies: ["tsx"],
    },
    "apps/admin-ui": {
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
    "packages/test-harness": {
      // Reserved for upcoming contract-test fixtures (A7.5-A7.8):
      // `@repo/tenancy` will back request-context test helpers and
      // `@repo/auth-tokens` will back JWT-claim-builder helpers.
      ignoreDependencies: ["@repo/tenancy", "@repo/auth-tokens"],
    },
  },
};

export default config;
