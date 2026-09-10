import * as z from "zod/mini";
import { clientConfig } from "@/lib/utils";

export interface ApiErrorBody {
  error: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  name?: string;
}

const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.catch(z.optional(z.string()), undefined),
    details: z.optional(z.unknown()),
    message: z.catch(z.optional(z.string()), undefined),
  }),
  name: z.catch(z.optional(z.string()), undefined),
});

export class ApiError extends Error {
  error: ApiErrorBody["error"];
  status: number;

  constructor(body: ApiErrorBody, status?: number, cause?: unknown) {
    super(
      body.error?.message ?? "Request failed",
      cause ? { cause } : undefined
    );
    this.name = body.name ?? "ApiError";
    this.error = body.error ?? { message: "Request failed" };
    this.status = status ?? 500;
  }

  static fromResponse<TBody>(
    res: Response,
    body: TBody,
    cause?: unknown
  ): ApiError {
    const parsed = apiErrorBodySchema.safeParse(body);
    const errorBody: ApiErrorBody = parsed.success
      ? parsed.data
      : { error: { message: res.statusText || "Request failed" } };
    return new ApiError(errorBody, res.status, cause);
  }
}

export { clientConfig };
