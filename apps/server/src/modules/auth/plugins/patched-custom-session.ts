/**
 * Patched version of better-auth's customSession plugin.
 *
 * Upstream bug: the customSession plugin reads Set-Cookie headers from
 * the internal getSession() response and re-sets them via ctx.setCookie().
 * ctx.setCookie() calls encodeURIComponent() on the value, but the value
 * extracted from the raw Set-Cookie header is already percent-encoded,
 * causing double encoding (%2B becomes %252B). This breaks signed session
 * cookies and causes "session not found" errors.
 *
 * Fix: forward raw Set-Cookie header strings directly via
 * ctx.responseHeaders.append() instead of parsing and re-serializing.
 *
 * TODO: Remove this file when better-auth ships a fix upstream.
 * Upstream issue: https://github.com/better-auth/better-auth/issues/8127
 */
import type { BetterAuthOptions, GenericEndpointContext } from "better-auth";
import { createAuthEndpoint, getSession } from "better-auth/api";
import type { Session, User } from "better-auth/types";
import { z } from "zod";

const getSessionQuerySchema = z.optional(
  z.object({
    disableCookieCache: z
      .boolean()
      .or(z.string().transform((v) => v === "true"))
      .optional(),
    disableRefresh: z.boolean().optional(),
  })
);

export const patchedCustomSession = <
  Returns extends Record<string, unknown>,
  O extends BetterAuthOptions = BetterAuthOptions,
>(
  fn: (
    session: {
      user: User<O["user"], O["plugins"]>;
      session: Session<O["session"], O["plugins"]>;
    },
    ctx: GenericEndpointContext
  ) => Promise<Returns>
) => {
  return {
    id: "custom-session" as const,
    endpoints: {
      getSession: createAuthEndpoint(
        "/get-session",
        {
          method: "GET",
          query: getSessionQuerySchema,
          metadata: {
            CUSTOM_SESSION: true,
            openapi: {
              description: "Get custom session data",
              responses: {
                "200": {
                  description: "Success",
                  content: {
                    "application/json": {
                      schema: {
                        type: "array",
                        nullable: true,
                        items: { $ref: "#/components/schemas/Session" },
                      },
                    },
                  },
                },
              },
            },
          },
          requireHeaders: true,
        },
        async (ctx) => {
          const session = await getSession()({
            ...ctx,
            asResponse: false,
            headers: ctx.headers,
            returnHeaders: true,
          }).catch(() => {
            return null;
          });

          if (!session?.response) {
            return ctx.json(null);
          }

          const fnResult = await fn(
            session.response as Parameters<typeof fn>[0],
            ctx
          );

          // FIX: Forward raw Set-Cookie headers directly instead of parsing
          // and re-serializing them through ctx.setCookie() which would
          // double-encode percent-encoded values in signed cookies.
          const responseHeaders = (
            ctx as unknown as { responseHeaders: Headers }
          ).responseHeaders;
          for (const cookieStr of session.headers.getSetCookie()) {
            responseHeaders.append("set-cookie", cookieStr);
          }

          session.headers.delete("set-cookie");
          session.headers.forEach((value, key) => {
            ctx.setHeader(key, value);
          });

          return ctx.json(fnResult);
        }
      ),
    },
    $Infer: { Session: {} as Awaited<Returns> },
  };
};
