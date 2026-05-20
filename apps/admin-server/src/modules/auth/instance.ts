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
  // Used for BA `allowedHosts` and JWT `aud`/`iss` so operator tokens cannot be replayed against the tenant perimeter.
  adminHost: string;
  // Local-dev only; production must not pass this.
  extraAllowedHosts?: readonly string[];
  resolveOperatorBinding?: (userId: string) => Promise<OperatorBinding | null>;
}>;

// Rows with an unbound user_id (enrollment-pending) never match here, so only fully-bound operators can sign in.
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

  // BA calls definePayload synchronously; the binding is stamped onto the session by the session-create hook below, so we read it from ctx rather than re-querying.
  function readBindingFromCtx(ctx: unknown): OperatorBinding | null {
    // boundary: BA's `jwt.definePayload` ctx type is not exported; narrowed defensively to `{ session?: { operatorId?, operatorSubRole? } }`.
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

    // No `fallback` so an unknown Host fails closed.
    baseURL: {
      allowedHosts: [...allowedHosts],
      protocol: "auto" as const,
    },
    basePath: "/api/auth",
    // BA's `/sso/register` writes oidcConfig via the raw adapter; block it since SSO is never mounted here.
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
      // Operators are invited via `global_admins`; the session-create gate would reject self-signups anyway — close upstream.
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
      // Forwarded headers must not influence BA's URL resolver.
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
            // boundary: BA's `databaseHooks.session.create.before` ctx type is not exported; narrowed to `{ userId?: unknown }` and guarded below.
            const userIdRaw = (session as { userId?: unknown }).userId;
            if (typeof userIdRaw !== "string") {
              throw new APIError("UNAUTHORIZED", {
                message: "Operator session requires a bound user",
              });
            }
            const binding = await resolveBinding(userIdRaw);
            if (!binding) {
              // Operator-vs-tenant boundary: a BA user without a `global_admins` row cannot open a session on the admin perimeter.
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
        // Pin EdDSA so a future BA default change cannot silently rotate operator tokens onto a different alg.
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
