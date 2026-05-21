/**
 * Single-narrow view of "who is making this request". `buildPrincipal` runs
 * Better Auth's `{ user, session }` shape through one set of guards and emits
 * a discriminated union so callers don't re-narrow at every call site.
 */

import type { AuthSession } from "@/modules/auth/instance";
import type { UserWithStatusFields } from "@/modules/auth/plugins/user-status";

type Platform = "web" | "mobile";

export type AuthenticatedPrincipal = {
  readonly kind: "authenticated";
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly roleSlugs: readonly string[];
  readonly status: UserWithStatusFields["status"];
  readonly activeOrganizationId: string | null;
  readonly activeOrgRole: string | null;
  readonly platform: Platform | null;
  /**
   * Legacy aliases for callers that still consume the BA-shaped objects.
   * New code should prefer the typed top-level fields above.
   */
  readonly user: AuthSession["user"];
  readonly session: AuthSession["session"];
  /**
   * boundary: escape hatch for BA-specific reads. Prefer the typed fields
   * above. `raw` is the same `{ user, session }` pair as the legacy aliases,
   * exposed via an explicitly-named handle so any new BA-shape dependency
   * shows up in grep at the read site.
   */
  readonly raw: {
    readonly user: AuthSession["user"];
    readonly session: AuthSession["session"];
  };
};

export type AnonymousPrincipal = {
  readonly kind: "anonymous";
  /**
   * Legacy aliases preserved as `undefined` so callers that still use
   * optional-chaining (`principal?.user`, `principal?.session`) continue
   * to compile against the union. New code should branch on `kind` or
   * use `isAuthenticated(principal)`.
   */
  readonly user?: undefined;
  readonly session?: undefined;
};

export type Principal = AnonymousPrincipal | AuthenticatedPrincipal;

export function isAuthenticated(p: Principal): p is AuthenticatedPrincipal {
  return p.kind === "authenticated";
}

/**
 * Read `activeOrganizationId` off the BA session. The field is added via
 * `additionalFields` so its TS type is widened — narrow here with a runtime
 * check rather than asserting through `as`.
 */
function readActiveOrgId(session: AuthSession["session"]): string | null {
  const raw = (session as { activeOrganizationId?: unknown })
    .activeOrganizationId;
  return typeof raw === "string" ? raw : null;
}

function readActiveOrgRole(session: AuthSession["session"]): string | null {
  const raw = (session as { activeOrgRole?: unknown }).activeOrgRole;
  return typeof raw === "string" ? raw : null;
}

function readPlatform(session: AuthSession["session"]): Platform | null {
  const raw = (session as { platform?: unknown }).platform;
  if (raw === "web" || raw === "mobile") {
    return raw;
  }
  return null;
}

export function buildPrincipal(authSession: AuthSession | null): Principal {
  if (!authSession) {
    return { kind: "anonymous" };
  }
  const { user, session } = authSession;
  return {
    kind: "authenticated",
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    roleSlugs: user.roleSlugs,
    status: user.status,
    activeOrganizationId: readActiveOrgId(session),
    activeOrgRole: readActiveOrgRole(session),
    platform: readPlatform(session),
    user,
    session,
    raw: { user, session },
  };
}
