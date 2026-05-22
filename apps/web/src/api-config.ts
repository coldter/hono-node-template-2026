import type { CreateClientConfig } from "@/api.gen/client.gen";
import { ApiError, clientConfig } from "@/lib/api";

/**
 * Runtime client configuration for the API client after it is generated.
 * The output is in /apps/web/src/api.gen/
 *
 * @link https://heyapi.dev/openapi-ts/get-started
 */
export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: import.meta.env.VITE_SERVER_URL || "http://localhost:3100",
  responseStyle: "data",
  throwOnError: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await clientConfig.fetch(input, init);

    if (response.ok) {
      return response;
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw ApiError.fromResponse(response, undefined);
    }
    throw ApiError.fromResponse(response, json);
  },
});
