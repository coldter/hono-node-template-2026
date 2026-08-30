import { type createRoute, z } from "@hono/zod-openapi";

type ResponseConfig = Parameters<typeof createRoute>[0]["responses"];

const failWithErrorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    details: z.string().optional(),
    message: z.string().optional(),
  }),
});

export const commonErrorResponses = {
  400: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description: "Bad request: problem processing request.",
  },
  401: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description: "Unauthorized: authentication required.",
  },
  403: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description: "Forbidden: insufficient permissions.",
  },
  404: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description: "Not found: resource does not exist.",
  },
  409: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description:
      "Conflict: the request conflicts with current state (e.g. unique constraint violation).",
  },
  422: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description:
      "Unprocessable entity: request body failed validation (Zod schema).",
  },
  429: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description: "Too many requests: rate limit exceeded.",
  },
  500: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description: "Server error: something went wrong.",
  },
  503: {
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
    description: "Service unavailable: dependency is not currently available.",
  },
} satisfies ResponseConfig;
