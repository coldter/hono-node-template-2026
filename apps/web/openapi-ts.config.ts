import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UserConfig } from "@hey-api/openapi-ts";
import { defineConfig } from "@hey-api/openapi-ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      runtimeConfigPath: "@/api-config",
      throwOnError: true,
    },
    {
      name: "@hey-api/sdk",
      responseStyle: "data",
    },
    {
      infiniteQueryKeys: true,
      infiniteQueryOptions: true,
      mutationOptions: true,

      name: "@tanstack/react-query",
      queryKeys: true,
      queryOptions: true,
    },
    {
      name: "zod",
    },
  ],
};

export default defineConfig(openApiConfig);
