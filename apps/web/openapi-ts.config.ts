import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "@hey-api/openapi-ts";
import { defineConfig } from "@hey-api/openapi-ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Hey API code generation config.
 *
 * All plugins below (client-fetch, sdk, @tanstack/react-query, zod) are
 * bundled inside the `@hey-api/openapi-ts` package, so no additional
 * dependencies are required.
 *
 * Zod plugin tradeoff:
 *   The `zod` plugin emits runtime schemas for request/response bodies so
 *   network payloads can be validated against the generated OpenAPI spec.
 *   The generated file is tree-shakeable: schemas only land in the bundle
 *   where they are imported. We keep it enabled because catching
 *   server/client contract drift at runtime is worth the small generation
 *   cost. If bundle size becomes a concern, drop the `zod` entry below.
 */
export const openApiConfig: UserConfig = {
  input: {
    path: path.resolve(__dirname, "../server/openapi.cache.json"),
    watch: false,
  },
  output: {
    path: path.resolve(__dirname, "./src/api.gen"),
    postProcess: [],
  },
  parser: {
    transforms: {
      readWrite: false,
    },
  },
  plugins: [
    {
      name: "@hey-api/client-fetch",
      throwOnError: true,
      runtimeConfigPath: "@/api-config",
    },
    {
      name: "@hey-api/sdk",
      responseStyle: "data",
    },
    {
      // Generate typed `queryOptions`, query keys, and mutation options
      // helpers. We do not enable the opinionated `useQuery` / `useMutation`
      // hook generators because the repo already has custom query hooks in
      // `apps/web/src/modules/*/query.ts` that layer on permission guards
      // and toast handling. Callers should compose with `queryOptions`.
      name: "@tanstack/react-query",
      queryOptions: true,
      queryKeys: true,
      mutationOptions: true,
      infiniteQueryOptions: true,
      infiniteQueryKeys: true,
    },
    {
      name: "zod",
    },
  ],
};

export default defineConfig(openApiConfig);
