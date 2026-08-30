import type { CreateClientConfig } from "@/api.gen/client.gen";
import { ApiError, clientConfig } from "@/lib/api";

export const createClientConfig: CreateClientConfig = (baseConfig) => ({
  ...baseConfig,
  baseUrl: import.meta.env.VITE_SERVER_URL || "http://localhost:3100",
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await clientConfig.fetch(input, init);

    if (response.ok) {
      return response;
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw ApiError.fromResponse(
        response,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
    throw ApiError.fromResponse(response, json);
  },
  responseStyle: "data",
  throwOnError: true,
});
