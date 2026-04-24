import type { Hook } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import type { Env } from "@/lib/context";

export const defaultHook: Hook<unknown, Env, "", unknown> = (result) => {
  if (!result.success && result.error instanceof ZodError) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue?.message ?? "Validation failed";
    // const type = `form.${code}` as const;
    throw new HTTPException(400, {
      cause: result.error,
      message,
    });
  }
};
