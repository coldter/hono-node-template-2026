/**
 * Boundary readers for Better Auth's loosely-typed hook payloads.
 *
 * Better Auth's database-hook callbacks receive `session`, `user`, and `ctx`
 * arguments whose generic type is widened to `unknown`/`Record<string, any>`
 * by additional-fields and plugin augmentation. The readers in this module
 * concentrate the narrowing logic (Zod `safeParse` at the boundary) so the
 * call sites in `instance.ts` keep strict typing.
 */

import { z } from "zod";

/**
 * Provider classifications inferred from BA endpoint paths. Used to drive
 * SSO enforcement: only `"credentials"` logins are checked because OAuth /
 * SSO logins already prove identity via a trusted IdP.
 */
export type AuthProvider = "credentials" | "social" | "sso" | "unknown";

// Path-to-provider classification. Order matters — `/sign-in/sso` must be
// checked before `/sign-in/` (credentials) and `/sso/` (any other SSO path).
const CREDENTIALS_PATH_RE = /^\/sign-in\/email(\/|$)/;
const SOCIAL_PATH_RE = /^\/(sign-in\/social|callback\/)/;
const SSO_PATH_RE = /^\/(sign-in\/sso|sso\/)/;

export function inferAuthProvider(ctx: unknown): AuthProvider {
  const path = readContextPath(ctx);
  if (!path) {
    return "unknown";
  }
  if (SSO_PATH_RE.test(path)) {
    return "sso";
  }
  if (CREDENTIALS_PATH_RE.test(path)) {
    return "credentials";
  }
  if (SOCIAL_PATH_RE.test(path)) {
    return "social";
  }
  return "unknown";
}

// Endpoint context narrowing (Zod boundary): pulls `path` off the hook ctx.
const ctxPathSchema = z.object({ path: z.string().optional() }).loose();
function readContextPath(ctx: unknown): string | null {
  const parsed = ctxPathSchema.safeParse(ctx);
  if (!parsed.success) {
    return null;
  }
  return parsed.data.path ?? null;
}

// Endpoint context narrowing for the session-update flow: we look for the
// authenticated user's id nested inside `ctx.context.session.user.id`.
const endpointCtxSchema = z
  .object({
    context: z
      .object({
        session: z
          .object({
            user: z.object({ id: z.string() }).partial().optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
  })
  .loose();

export function getSessionUserId(ctx: unknown): string | undefined {
  const parsed = endpointCtxSchema.safeParse(ctx);
  if (!parsed.success) {
    return;
  }
  return parsed.data.context?.session?.user?.id;
}

// Session-update payload narrowing: we only inspect `activeOrganizationId`;
// every other field passes through untouched.
const sessionUpdateInputSchema = z
  .object({
    activeOrganizationId: z.string().nullable().optional(),
  })
  .loose();

export function readSessionUpdateActiveOrgId(
  session: unknown
): string | null | undefined {
  const parsed = sessionUpdateInputSchema.safeParse(session);
  if (!parsed.success) {
    return;
  }
  return parsed.data.activeOrganizationId;
}

// `readActiveOrganizationId` lived here historically. It is now obsolete:
// the per-request Principal Module (`@/modules/auth/principal`) carries
// `activeOrganizationId` as a typed top-level field, so request-side
// callers no longer reach into the BA-shaped session payload directly.
// The hook-context readers above (`inferAuthProvider`, `getSessionUserId`,
// `readSessionUpdateActiveOrgId`) remain because they read BA's database-
// hook payloads, which are a different boundary than the request session.
