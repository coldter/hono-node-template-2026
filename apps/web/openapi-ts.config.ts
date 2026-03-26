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
    { name: "@hey-api/sdk", responseStyle: "data" },
    {
      name: "@hey-api/client-fetch",
      throwOnError: true,
      runtimeConfigPath: "@/api-config",
    },
  ],
};

export default defineConfig(openApiConfig);
