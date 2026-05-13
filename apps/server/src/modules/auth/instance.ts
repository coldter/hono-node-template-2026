import { sso } from "@better-auth/sso";
import type { DrizzleClient } from "@repo/db";
import { liveOrganizations, organizations } from "@repo/db";
import * as schema from "@repo/db/schema";
import type { HostConfig, Tenant } from "@repo/tenancy";
import {
  type BetterAuthOptions,
  betterAuth,
  type Session,
  type User,
} from "better-auth";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { seconds } from "itty-time";
import type { Logger } from "winston";
import { z } from "zod";
import { env } from "@/env";
import type { UserWithStatusFields } from "@/modules/auth/plugins/user-status";
import { SYSTEM_ROLES } from "@/modules/auth/roles";
import * as activeSessionJwt from "./active-session-jwt";
import {
  type AllowedHostsSnapshot,
  type AuthHostPolicy,
  buildAuthHostPolicy,
} from "./auth-host-policy";
import { RATE_LIMIT_CONFIG } from "./constants";
import { enforceSsoIfRequired } from "./enforce-sso";
import { createAuthBase } from "./instance-base";
import type { JtiKillList } from "./jti-kill-list";
import { buildTenantJwtPayload } from "./jwt-payload";
import { disableOrgCreatePlugin } from "./plugins/disable-org-create";
import { runSessionDeleteAfter } from "./run-session-delete-after";
import {
  getSessionUserId,
  inferAuthProvider,
  readSessionUpdateActiveOrgId,
} from "./session-readers";
import { shouldAutoLink } from "./sso-link-rules";

// Access-token TTL in seconds. Mirrors the `"15m"` string passed to BA's
// `jwt.expirationTime` — kept as a number here so the `definePayload`
// side-effect can compute the same `exp` Date that BA will sign.
const JWT_TTL_SECONDS = 15 * 60;

const platformSchema = z.enum(["web", "mobile"]);

const SESSION_CONFIG = {
  web: {
    expiresIn: seconds("1 hour"),
    updateAge: seconds("30 minutes"),
  },
  mobile: {
    expiresIn: seconds("7 days"),
    updateAge: seconds("1 day"),
  },
} as const;

type Platform = "web" | "mobile";

export type SessionWithAdditionalFields = {
  platform: Platform;
  expiresAt: Date;
  activeOrgRole: string | null;
};

const MOBILE_PATTERNS = [
  /android/i,
  /iphone/i,
  /ipad/i,
  /mobile/i,
  /okhttp/i,
  /dart/i,
  /flutter/i,
  /react-native/i,
  /expo/i,
];

const detectPlatform = (userAgent: string | null): Platform => {
  if (!userAgent) {
    return "web";
  }
  return MOBILE_PATTERNS.some((pattern) => pattern.test(userAgent))
    ? "mobile"
    : "web";
};

function resolveClientIp(headers: Headers | undefined): string | null {
  const forwarded = headers?.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  return headers?.get("x-real-ip") ?? null;
}

// Public sign-up is closed by `disableSignUp: true`; an invitation-token gate
// will be added once invitation flows land.
function applyDefaultUserClaims<U>(user: U): U & {
  roleSlugs: string[];
  status: "active";
  failedLoginAttempts: number;
  twoFactorEnabled: boolean;
} {
  return {
    ...user,
    roleSlugs: [SYSTEM_ROLES.USER.slug],
    status: "active",
    failedLoginAttempts: 0,
    twoFactorEnabled: false,
  };
}

export type CreateAuthDeps = Readonly<{
  db: DrizzleClient;
  tenant: Tenant | null;
  tenantConfig: HostConfig;
  allowedHostsSnapshot: AllowedHostsSnapshot;
  logger: Logger;
  /**
   * Kill-list for revoked JWT jtis. Memory adapter in dev/tests; Redis
   * adapter in production. Wired into the session-delete-after hook so
   * logout fans the current jti into the kill-list.
   */
  killList: JtiKillList;
  /** Extra origins accepted regardless of the resolved tenant. */
  extraTrustedOrigins?: readonly string[];
}>;

type SessionCreateBeforeDeps = Readonly<{
  db: DrizzleClient;
  logger: Logger;
}>;

type SessionCreateBeforeInput = Readonly<{
  userId: string;
  // Allow any additional BA fields to pass through unchanged.
  [key: string]: unknown;
}>;

type SessionCreateBeforeContext = Readonly<{
  headers?: Headers | undefined;
  path?: string | undefined;
}>;

type SessionCreateBeforeResult = {
  data: Record<string, unknown>;
};

/**
 * Order is load-bearing: org resolution → provider classification → SSO
 * enforcement runs BEFORE any platform / session-revocation /
 * new-device side-effects, so a credentials login into an SSO-enforced
 * tenant aborts without disturbing existing sessions or queuing alerts.
 */
export async function runSessionCreateBefore(
  session: SessionCreateBeforeInput,
  context: SessionCreateBeforeContext | undefined,
  deps: SessionCreateBeforeDeps,
  helpers: Readonly<{
    resolveInitialOrganizationContext: (userId: string) => Promise<{
      activeOrganizationId: string;
      activeOrgRole: string;
    } | null>;
    queueNewDeviceNotification: (params: {
      userId: string;
      ipAddress: string | null;
      userAgent: string | null;
      platform: Platform;
    }) => void;
  }>
): Promise<SessionCreateBeforeResult> {
  const orgContext = await helpers.resolveInitialOrganizationContext(
    session.userId
  );

  // The session payload doesn't carry `provider` (that lives on `account`),
  // so we infer it from the BA endpoint path.
  const provider = inferAuthProvider(context);

  // Enforcement happens BEFORE side-effects so a denied login leaves no
  // observable trace. Short-circuits when there's no active org or the
  // provider isn't credentials.
  await enforceSsoIfRequired(
    {
      activeOrganizationId: orgContext?.activeOrganizationId ?? null,
      provider,
    },
    context,
    deps.db
  );

  const userAgent = context?.headers?.get("user-agent") ?? null;
  const ipAddress = resolveClientIp(context?.headers);
  const platform = detectPlatform(userAgent);
  const platformCfg = SESSION_CONFIG[platform];

  const [previousSession] = await deps.db
    .select({
      userAgent: schema.sessions.userAgent,
      ipAddress: schema.sessions.ipAddress,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, session.userId))
    .limit(1);

  // Single session per user.
  await deps.db
    .delete(schema.sessions)
    .where(eq(schema.sessions.userId, session.userId));

  if (previousSession) {
    const isNewDevice =
      previousSession.userAgent !== userAgent ||
      previousSession.ipAddress !== ipAddress;

    if (isNewDevice) {
      helpers.queueNewDeviceNotification({
        userId: session.userId,
        ipAddress,
        userAgent,
        platform,
      });
    }
  }

  const expiresAt = new Date(Date.now() + platformCfg.expiresIn * 1000);

  return {
    data: {
      ...session,
      platform,
      expiresAt,
      ...(orgContext ?? {}),
    },
  };
}

type ProvisionUserGateDeps = Readonly<{
  db: DrizzleClient;
  logger: Logger;
}>;

export type ProvisionUserGateArgs = Readonly<{
  user: Record<string, unknown>;
  userInfo: Record<string, unknown>;
  provider: Record<string, unknown>;
}>;

/**
 * SSO auto-link gate. Throws `APIError("FORBIDDEN")` when any of the three
 * required signals are missing: IdP-confirmed `emailVerified`, an existing
 * live-org membership row, and a verified email domain. Membership is
 * checked via `liveOrganizations` so a tombstoned org cannot auto-link
 * even if a stale `members` row survives the cascade window.
 */
export async function runProvisionUserGate(
  args: ProvisionUserGateArgs,
  deps: ProvisionUserGateDeps
): Promise<void> {
  // boundary: BA's SSOOptions types `user`/`userInfo`/`provider` with
  // `Record<string, any>` index signatures, so per-field shape is not
  // statically known. Each field is narrowed with a runtime guard.
  const { user, userInfo, provider } = args;

  const emailVerifiedRaw = userInfo.emailVerified ?? user.emailVerified;
  const emailVerified = emailVerifiedRaw === true;

  const domainVerified =
    "domainVerified" in provider && provider.domainVerified === true;

  const organizationIdRaw = provider.organizationId;
  const organizationId =
    typeof organizationIdRaw === "string" ? organizationIdRaw : null;

  const userIdRaw = user.id;
  const userId = typeof userIdRaw === "string" ? userIdRaw : null;

  let hasMembership = false;
  if (organizationId && userId) {
    // `liveOrganizations` carries the soft-delete predicate so a
    // tombstoned tenant cannot pass the gate.
    const liveOrgRows = await liveOrganizations(deps.db).selectById(
      { id: organizations.id },
      organizationId
    );
    if (liveOrgRows[0]) {
      const [member] = await deps.db
        .select({ id: schema.members.id })
        .from(schema.members)
        .where(
          and(
            eq(schema.members.userId, userId),
            eq(schema.members.organizationId, organizationId)
          )
        )
        .limit(1);
      hasMembership = Boolean(member);
    }
  }

  if (!shouldAutoLink({ emailVerified, hasMembership, domainVerified })) {
    const providerIdRaw = provider.providerId;
    deps.logger.warn("SSO auto-link rejected by D8 gate", {
      emailVerified,
      hasMembership,
      domainVerified,
      organizationId,
      providerId: typeof providerIdRaw === "string" ? providerIdRaw : null,
    });
    throw new APIError("FORBIDDEN", {
      message: "SSO auto-link denied for this organization",
    });
  }
}

type SessionUpdateBeforeContext = Readonly<{
  headers?: Headers | undefined;
}>;

type SessionUpdateBeforeResult = {
  data: Record<string, unknown>;
};

export async function runSessionUpdateBefore(
  session: Record<string, unknown>,
  context: SessionUpdateBeforeContext | undefined,
  helpers: Readonly<{
    resolveActiveOrganizationRole: (
      userId: string,
      organizationId: string
    ) => Promise<string | null | undefined>;
  }>
): Promise<SessionUpdateBeforeResult> {
  const activeOrganizationId = readSessionUpdateActiveOrgId(session);

  if (activeOrganizationId !== undefined) {
    const newOrgId = activeOrganizationId;

    if (!newOrgId) {
      return {
        data: { ...session, activeOrgRole: null },
      };
    }

    const userId = getSessionUserId(context);

    if (userId) {
      const activeOrgRole = await helpers.resolveActiveOrganizationRole(
        userId,
        newOrgId
      );

      if (activeOrgRole === undefined) {
        return { data: session };
      }

      return {
        data: {
          ...session,
          activeOrgRole,
        },
      };
    }

    return { data: session };
  }

  // Only intervene when Better Auth is refreshing the session expiry; other
  // updates pass through.
  if (!session.expiresAt) {
    return { data: session };
  }

  // The update hook only receives the update payload (no session id/token),
  // so platform is detected from the same user-agent that triggered the
  // refresh.
  const userAgent = context?.headers?.get("user-agent") ?? null;
  const platform = detectPlatform(userAgent);

  if (platform === "web") {
    return {
      data: {
        ...session,
        expiresAt: new Date(Date.now() + SESSION_CONFIG.web.expiresIn * 1000),
      },
    };
  }

  return { data: session };
}

export function createAuth(deps: CreateAuthDeps) {
  const hostPolicy: AuthHostPolicy = buildAuthHostPolicy({
    snapshot: deps.allowedHostsSnapshot,
    tenant: deps.tenant,
    tenantConfig: deps.tenantConfig,
    extraTrustedOrigins: deps.extraTrustedOrigins,
  });

  const log = deps.logger;

  async function resolveInitialOrganizationContext(userId: string): Promise<{
    activeOrganizationId: string;
    activeOrgRole: string;
  } | null> {
    try {
      const [firstMembership] = await deps.db
        .select({
          organizationId: schema.members.organizationId,
          role: schema.members.role,
        })
        .from(schema.members)
        .where(eq(schema.members.userId, userId))
        .orderBy(desc(schema.members.createdAt))
        .limit(1);

      if (!firstMembership) {
        return null;
      }

      return {
        activeOrganizationId: firstMembership.organizationId,
        activeOrgRole: firstMembership.role,
      };
    } catch (error) {
      log.warn("Failed to resolve initial organization context", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async function resolveActiveOrganizationRole(
    userId: string,
    organizationId: string
  ): Promise<string | null | undefined> {
    try {
      const [membership] = await deps.db
        .select({ role: schema.members.role })
        .from(schema.members)
        .where(
          and(
            eq(schema.members.userId, userId),
            eq(schema.members.organizationId, organizationId)
          )
        )
        .limit(1);

      return membership?.role ?? null;
    } catch (error) {
      log.warn("Failed to resolve active organization role", {
        userId,
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  function queueNewDeviceNotification(params: {
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    platform: Platform;
  }) {
    import("./auth-notifications")
      .then((module) => module.notifyLoginNewDevice(params))
      .catch((error) => {
        log.warn("Failed to queue new-device notification", {
          userId: params.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  const base = createAuthBase({
    db: deps.db,
    appName: env.APP_NAME,
    secret: env.BETTER_AUTH_SECRET,
    logger: log,
  });

  const authConfig = {
    ...base,
    // Object-form baseURL: BA validates the request host against
    // `allowedHosts` and derives the baseURL from the request. We deliberately
    // omit `fallback` so an unknown host fails closed. For request-less paths
    // (init, email templates) BA falls back to BETTER_AUTH_URL via the env
    // loader.
    baseURL: {
      allowedHosts: [...hostPolicy.allowedHosts],
      protocol: "auto",
    },
    basePath: "/api/auth",
    // BA's `/sso/register` endpoint writes `oidcConfig` to a single text
    // column via the raw adapter. Our schema stores the config across three
    // encrypted columns, so the plugin's insert would fail at the DB level.
    // Block the route here until a tenant-aware replacement ships.
    disabledPaths: ["/sso/register"],
    trustedOrigins: (req: Request | undefined) =>
      hostPolicy.trustedOrigins(req).then((origins) => [...origins]),

    rateLimit: {
      enabled: true,
      window: RATE_LIMIT_CONFIG.global.window,
      max: RATE_LIMIT_CONFIG.global.max,
      storage: "memory",
      customRules: {
        "/sign-in/email": {
          window: RATE_LIMIT_CONFIG.signIn.window,
          max: RATE_LIMIT_CONFIG.signIn.max,
        },
      },
    },

    emailAndPassword: {
      ...base.emailAndPassword,
      enabled: true,
      // Only invited users may create accounts on tenant hosts; public
      // sign-up is closed.
      disableSignUp: true,
      requireEmailVerification: true,
    },

    session: {
      // Default to mobile windows so cookie Max-Age matches 7-day mobile
      // sessions. Web sessions are shortened in database hooks.
      expiresIn: SESSION_CONFIG.mobile.expiresIn,
      updateAge: SESSION_CONFIG.mobile.updateAge,
      cookieCache: { enabled: true, maxAge: 60 },
      additionalFields: {
        platform: {
          type: [...platformSchema.options],
          required: false,
          defaultValue: "web",
        },
        activeOrgRole: {
          type: "string",
          required: false,
        },
      },
    },

    advanced: {
      ...base.advanced,
      // Do not trust proxy headers by default — BA uses x-forwarded-* only
      // when this is true. Re-enable behind a verified reverse proxy.
      trustedProxyHeaders: false,
      defaultCookieAttributes: {
        sameSite: "lax",
        httpOnly: true,
      },
      cookies: {
        session_token: {
          name: "session_token_v1",
          attributes: {
            httpOnly: true,
          },
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: applyDefaultUserClaims(user),
          }),
        },
      },
      session: {
        create: {
          // BA passes `null` when the hook fires outside an endpoint context
          // (e.g. impersonation); narrow to `undefined` for the helper.
          before: async (session, context) =>
            runSessionCreateBefore(
              session,
              context ?? undefined,
              { db: deps.db, logger: log },
              {
                resolveInitialOrganizationContext,
                queueNewDeviceNotification,
              }
            ),
        },
        update: {
          before: async (session, context) =>
            runSessionUpdateBefore(session, context ?? undefined, {
              resolveActiveOrganizationRole,
            }),
        },
        delete: {
          // boundary: BA's delete-hook session shape is the row, but the
          // generated type is `Session & AdditionalFields` which widens
          // through plugin augmentation. `runSessionDeleteAfter` accepts a
          // permissive shape and narrows `id` at runtime.
          after: async (session) =>
            runSessionDeleteAfter(session, {
              db: deps.db,
              killList: deps.killList,
              logger: log,
            }),
        },
      },
    },

    plugins: [
      ...(base.plugins ?? []),
      // SSO auto-link requires THREE signals together: IdP `email_verified`,
      // an existing membership row in the matched org, and a verified
      // domain. BA covers (1) and (3) natively; the membership check lives
      // in `runProvisionUserGate`, re-run on every login.
      sso({
        trustEmailVerified: true,
        provisionUserOnEveryLogin: true,
        domainVerification: { enabled: true },
        organizationProvisioning: {
          disabled: false,
          defaultRole: "member",
          // Always provision as "member"; org-admin promotion happens via
          // the invitation/role-management flows, never silently on SSO.
          getRole: () => Promise.resolve("member"),
        },
        provisionUser: async ({ user, userInfo, provider }) =>
          runProvisionUserGate(
            {
              user,
              userInfo,
              // boundary: BA's `provider` is typed `SSOProvider<SSOOptions>`,
              // a struct with optional fields plus an index signature in
              // practice. Re-shape as `Record<string, unknown>` for the
              // gate's runtime field reads.
              provider: provider as unknown as Record<string, unknown>,
            },
            { db: deps.db, logger: log }
          ),
      }),
      jwt({
        // Pin EdDSA explicitly so a future BA default change cannot silently
        // rotate us onto a different alg.
        jwks: {
          keyPairConfig: { alg: "EdDSA" },
        },
        jwt: {
          expirationTime: "15m",
          // `definePayload` side-effect is deliberate: BA's jwt plugin
          // (1.6.10) exposes no `onTokenIssued`-style hook, and the payload
          // built here already carries the canonical `jti` (from
          // @repo/auth-tokens). We pin `exp` in the returned payload so the
          // value stamped on the sessions row exactly matches what BA signs.
          // The kill-list write is fire-and-forget — token issuance must not
          // block on session-row bookkeeping.
          definePayload: (ctx) => {
            const claims = buildTenantJwtPayload(ctx, deps.tenant);
            const expSeconds = Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS;
            const jtiRaw = claims.jti;
            const sessionId =
              typeof ctx.session?.id === "string" ? ctx.session.id : null;
            if (typeof jtiRaw === "string" && sessionId !== null) {
              const expDate = new Date(expSeconds * 1000);
              activeSessionJwt
                .recordMint(
                  { db: deps.db },
                  { sessionId, jti: jtiRaw, exp: expDate }
                )
                .catch((error) => {
                  log.warn("Failed to record JWT mint on session row", {
                    sessionId,
                    error:
                      error instanceof Error ? error.message : String(error),
                  });
                });
            }
            return { ...claims, exp: expSeconds };
          },
        },
      }),
      disableOrgCreatePlugin(),
      {
        id: "override-type",
        $Infer: {} as {
          Session: {
            user: User & UserWithStatusFields;
            session: Session & SessionWithAdditionalFields;
          };
        },
      },
    ],
  } satisfies BetterAuthOptions;

  return betterAuth(authConfig);
}

export type AuthInstance = ReturnType<typeof createAuth>;
export type AuthSession = AuthInstance["$Infer"]["Session"];
