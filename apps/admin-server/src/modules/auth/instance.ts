/**
 * Operator-perimeter Better Auth factory.
 *
 * Distinct from `apps/server`'s tenant-facing `createAuth`:
 *   - single pinned host (`ADMIN_HOST`) — no wildcard, no custom hostnames
 *   - separate BA secret (`OPERATOR_BETTER_AUTH_SECRET`) so a leaked tenant
 *     secret cannot mint operator sessions and vice versa
 *   - no SSO plugin, no organization plugin
 *   - public sign-up closed; operators are invited via `global_admins`
 *   - JWT plugin emits the operator-shaped `OperatorJwtClaims` (no `org`)
 *   - a `session.create.before` hook asserts the BA user_id has a matching
 *     row in `global_admins`; non-operator users cannot sign in here
 *
 * `createAuthBase` is intentionally not reused: the tenant-server plugins
 * it composes (`adminPlugin`, `loginSecurityPlugin`) hard-import the
 * tenant-server `@/db` and `@/modules/users` singletons. Lifting those
 * couplings into a shared `@repo/auth-core` is tracked as a follow-up.
 */

import {
  buildArgon2idHasher,
  buildDrizzleAdapter,
  buildIdGenerator,
} from "@repo/auth-tokens";
import {
  buildOperatorClaims,
  type OperatorBinding,
} from "@repo/auth-tokens/operator-claims";
import type { DrizzleClient } from "@repo/db";
import * as schema from "@repo/db/schema";
import {
  type BetterAuthOptions,
  betterAuth,
  type Session,
  type User,
} from "better-auth";
import { APIError } from "better-auth/api";
import { emailOTP, jwt, openAPI, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { seconds } from "itty-time";
import type { Logger } from "winston";
import { env } from "@/env";

const JWT_TTL_SECONDS = 15 * 60;

const SESSION_WINDOW = {
  expiresIn: seconds("1 hour"),
  updateAge: seconds("30 minutes"),
} as const;

const OTP_CONFIG = {
  otpLength: 6,
  emailOtpExpiresIn: 300,
  twoFactorOtpPeriodMinutes: 3,
} as const;

const OPERATOR_RATE_LIMITS = {
  global: { window: 60, max: 500 },
  signIn: { window: 60, max: 30 },
} as const;

const operatorHasher = buildArgon2idHasher(env.OPERATOR_BETTER_AUTH_SECRET);

export type AdminAuthDeps = Readonly<{
  db: DrizzleClient;
  logger: Logger;
  /**
   * Pinned admin host. Used both for BA's `allowedHosts` and for the
   * JWT `aud`/`iss` so tokens minted here cannot be replayed against the
   * tenant perimeter.
   */
  adminHost: string;
  /**
   * Extra allowed hosts for local-dev only. Production must not pass this.
   */
  extraAllowedHosts?: readonly string[];
  /**
   * Resolves a BA user_id to an operator binding (global-admin id +
   * sub-role) or `null` when the user is not a global-admin. Injected so
   * tests can stub without a real DB.
   */
  resolveOperatorBinding?: (userId: string) => Promise<OperatorBinding | null>;
}>;

/**
 * Default operator binding lookup. Resolves `global_admins.user_id` ->
 * `{ id, subRole }`. Rows with an unbound `user_id` (enrollment-pending)
 * never match here and therefore cannot authenticate — only fully-bound
 * operators can sign in.
 */
async function defaultResolveOperatorBinding(
  db: DrizzleClient,
  userId: string
): Promise<OperatorBinding | null> {
  const [row] = await db
    .select({
      id: schema.globalAdmins.id,
      subRole: schema.globalAdmins.subRole,
    })
    .from(schema.globalAdmins)
    .where(eq(schema.globalAdmins.userId, userId))
    .limit(1);

  if (!row) {
    return null;
  }
  return { id: row.id, subRole: row.subRole };
}

/**
 * Operator-session additional fields. No `platform` (operators use a single
 * web admin UI) and no `activeOrgRole` (operators are not tenant members).
 */
export type OperatorSessionAdditionalFields = {
  operatorId: string;
  operatorSubRole: OperatorBinding["subRole"];
};

export function createAdminAuth(deps: AdminAuthDeps) {
  const log = deps.logger;
  const allowedHosts = Object.freeze([
    deps.adminHost,
    ...(deps.extraAllowedHosts ?? []),
  ]);

  const resolveBinding =
    deps.resolveOperatorBinding ??
    ((userId: string) => defaultResolveOperatorBinding(deps.db, userId));

  // Captured for the JWT `definePayload` callback. BA calls definePayload
  // synchronously and we cannot await a DB lookup there; the binding has
  // already been written onto the session row by the session-create hook,
  // so the JWT mint reads it from the ctx instead of re-querying.
  function readBindingFromCtx(ctx: unknown): OperatorBinding | null {
    // boundary: BA's `jwt.definePayload` ctx type is not exported. The
    // session's additional fields are stamped by the session-create hook
    // below, then surfaced on `ctx.session`. We narrow defensively.
    const maybe = ctx as {
      session?: { operatorId?: unknown; operatorSubRole?: unknown };
    };
    const id = maybe?.session?.operatorId;
    const subRole = maybe?.session?.operatorSubRole;
    if (typeof id !== "string" || typeof subRole !== "string") {
      return null;
    }
    if (
      subRole !== "platform_admin" &&
      subRole !== "support" &&
      subRole !== "read_only"
    ) {
      return null;
    }
    return { id, subRole };
  }

  const authConfig = {
    appName: env.APP_NAME,
    secret: env.OPERATOR_BETTER_AUTH_SECRET,
    database: buildDrizzleAdapter(deps.db),

    // Single pinned host. No `fallback` so an unknown Host fails closed.
    baseURL: {
      allowedHosts: [...allowedHosts],
      protocol: "auto" as const,
    },
    basePath: "/api/auth",
    // BA's `/sso/register` writes oidcConfig via the raw adapter and we
    // never mount SSO on this perimeter — block the path so it cannot be
    // hit accidentally.
    disabledPaths: ["/sso/register"],

    rateLimit: {
      enabled: true,
      window: OPERATOR_RATE_LIMITS.global.window,
      max: OPERATOR_RATE_LIMITS.global.max,
      storage: "memory" as const,
      customRules: {
        "/sign-in/email": {
          window: OPERATOR_RATE_LIMITS.signIn.window,
          max: OPERATOR_RATE_LIMITS.signIn.max,
        },
      },
    },

    emailAndPassword: {
      enabled: true,
      // Operators are invited via `global_admins`; public sign-up would
      // create BA users without any matching operator row, which the
      // session-create gate would then reject anyway. Close the door
      // upstream so the failure surface is one layer thinner.
      disableSignUp: true,
      requireEmailVerification: false,
      password: {
        hash: operatorHasher.hash,
        verify: operatorHasher.verify,
      },
    },

    session: {
      expiresIn: SESSION_WINDOW.expiresIn,
      updateAge: SESSION_WINDOW.updateAge,
      cookieCache: { enabled: true, maxAge: 60 },
      additionalFields: {
        operatorId: {
          type: "string" as const,
          required: false,
        },
        operatorSubRole: {
          type: "string" as const,
          required: false,
        },
      },
    },

    advanced: {
      database: {
        generateId: buildIdGenerator(log),
      },
      // Operator surface is fronted by the same edge as the tenant surface
      // but tenant-server's policy of not trusting proxy headers applies
      // here too: don't let forwarded headers influence BA's URL resolver.
      trustedProxyHeaders: false,
      defaultCookieAttributes: {
        sameSite: "lax" as const,
        httpOnly: true,
      },
      cookies: {
        session_token: {
          name: "op_session_token_v1",
          attributes: {
            httpOnly: true,
          },
        },
      },
    },

    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const userIdRaw = (session as { userId?: unknown }).userId;
            if (typeof userIdRaw !== "string") {
              throw new APIError("UNAUTHORIZED", {
                message: "Operator session requires a bound user",
              });
            }
            const binding = await resolveBinding(userIdRaw);
            if (!binding) {
              // The operator-vs-tenant boundary is enforced here: tenant
              // users (rows in `users` with no `global_admins` row) cannot
              // open a session on the admin perimeter, even if they share
              // an email with an enrolled operator.
              throw new APIError("FORBIDDEN", {
                message: "User is not enrolled as an operator",
              });
            }
            return {
              data: {
                ...session,
                operatorId: binding.id,
                operatorSubRole: binding.subRole,
              },
            };
          },
        },
      },
    },

    plugins: [
      emailOTP({
        otpLength: OTP_CONFIG.otpLength,
        expiresIn: OTP_CONFIG.emailOtpExpiresIn,
        // Operators are invited — they never go through self-service
        // sign-up so this OTP path is only reached on explicit reset.
        sendVerificationOnSignUp: false,
        async sendVerificationOTP({ email, otp, type }) {
          log.info("operator-otp", {
            email,
            type,
            otpDigits: otp.length,
          });
        },
      }),
      twoFactor({
        twoFactorTable: "twoFactors",
        skipVerificationOnEnable: true,
        otpOptions: {
          period: OTP_CONFIG.twoFactorOtpPeriodMinutes,
          async sendOTP({ user, otp }) {
            log.info("operator-2fa-otp", {
              userId: user.id,
              otpDigits: otp.length,
            });
          },
        },
      }),
      openAPI({
        disableDefaultReference: true,
      }),
      jwt({
        // Pin EdDSA explicitly so a future BA default change cannot
        // silently rotate operator tokens onto a different alg.
        jwks: {
          keyPairConfig: { alg: "EdDSA" },
        },
        jwt: {
          expirationTime: "15m",
          definePayload: (ctx) => {
            const binding = readBindingFromCtx(ctx);
            const claims = buildOperatorClaims(ctx, binding, deps.adminHost);
            const expSeconds = Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS;
            return { ...claims, exp: expSeconds };
          },
        },
      }),
      {
        id: "operator-session-override-type",
        $Infer: {} as {
          Session: {
            user: User;
            session: Session & OperatorSessionAdditionalFields;
          };
        },
      },
    ],
  } satisfies BetterAuthOptions;

  return betterAuth(authConfig);
}

export type AdminAuthInstance = ReturnType<typeof createAdminAuth>;
export type AdminAuthSession = AdminAuthInstance["$Infer"]["Session"];
