import { type createRoute, z } from "@hono/zod-openapi";

type ResponseConfig = Parameters<typeof createRoute>[0]["responses"];

const failWithErrorSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
    details: z.string().optional(),
  }),
});

export const commonErrorResponses = {
  400: {
    description: "Bad request: problem processing request.",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  401: {
    description: "Unauthorized: authentication required.",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  403: {
    description: "Forbidden: insufficient permissions.",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  404: {
    description: "Not found: resource does not exist.",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  409: {
    description:
      "Conflict: the request conflicts with current state (e.g. unique constraint violation).",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  422: {
    description:
      "Unprocessable entity: request body failed validation (Zod schema).",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  429: {
    description: "Too many requests: rate limit exceeded.",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  500: {
    description: "Server error: something went wrong.",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
  503: {
    description: "Service unavailable: dependency is not currently available.",
    content: {
      "application/json": {
        schema: failWithErrorSchema,
      },
    },
  },
} satisfies ResponseConfig;
