import { clientConfig } from "@/lib/utils";

export interface ApiErrorBody {
  error: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  name?: string;
}

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

  static fromResponse(res: Response, body: unknown, cause?: unknown): ApiError {
    const parsed = isApiErrorBody(body)
      ? body
      : { error: { message: res.statusText || "Request failed" } };
    return new ApiError(parsed, res.status, cause);
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as { error?: unknown };
  return typeof candidate.error === "object" && candidate.error !== null;
}

export { clientConfig };
