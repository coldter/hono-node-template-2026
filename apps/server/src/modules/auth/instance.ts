import * as schema from "@repo/db/schema";
import {
  sendEmail,
  TwoFactorOtpEmail,
  VerificationOtpEmail,
} from "@repo/email";
import {
  type BetterAuthOptions,
  betterAuth,
  type Session,
  type User,
} from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, openAPI, twoFactor } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { seconds } from "itty-time";
import { z } from "zod";
import { db } from "@/db";
import { env } from "@/env";
import { generateIdForModel } from "@/lib/ids";
import { logger } from "@/lib/logger";
import { getRedis, isRedisEnabled } from "@/lib/redis";
import { adminPlugin } from "@/modules/auth/plugins/admin";
import { loginSecurityPlugin } from "@/modules/auth/plugins/login-security";
import {
  enhancedUserPlugin,
  type UserWithStatusFields,
} from "@/modules/auth/plugins/user-status";
import { createRedisRateLimitStorage } from "@/modules/auth/rate-limit-storage";
import { SYSTEM_ROLES } from "@/modules/auth/roles";
import { RATE_LIMIT_CONFIG, TWO_FACTOR_CONFIG } from "./constants";
import { hashPassword, verifyPasswordHash } from "./helpers/argon2id";

const platformSchema = z.enum(["web", "mobile"]);

const SESSION_CONFIG = {
  mobile: {
    expiresIn: seconds("7 days"),
    updateAge: seconds("1 day"),
  },
  web: {
    expiresIn: seconds("1 hour"),
    updateAge: seconds("30 minutes"),
  },
} as const;

type Platform = "web" | "mobile";

function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return "***";
  }
  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  const visible = localPart.slice(0, 2);
  return `${visible}***${domain}`;
}

function sanitizeHeaderText(
  value: string | undefined,
  maxLength: number
): string | undefined {
  if (value === undefined) {
    return;
  }
  const stripped = value.replace(/[\r\n<>]/g, "");
  return stripped.slice(0, maxLength);
}

export type SessionWithAdditionalFields = {
  platform: Platform;
  expiresAt: Date;
  activeOrganizationId: string | null;
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

const sessionUpdateInputSchema = z
  .object({
    activeOrganizationId: z.string().nullable().optional(),
  })
  .loose();

// Better Auth endpoint context is typed as `unknown`; defensively walk and narrow.
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

function getSessionUserId(ctx: unknown): string | undefined {
  const parsed = endpointCtxSchema.safeParse(ctx);
  if (!parsed.success) {
    return;
  }
  return parsed.data.context?.session?.user?.id;
}

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

async function resolveInitialOrganizationContext(userId: string): Promise<{
  activeOrganizationId: string;
  activeOrgRole: string;
} | null> {
  try {
    const [firstMembership] = await db
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
    logger.warn("Failed to resolve initial organization context", {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return null;
  }
}

async function resolveActiveOrganizationRole(
  userId: string,
  organizationId: string
): Promise<string | null | undefined> {
  try {
    const [membership] = await db
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
    logger.warn("Failed to resolve active organization role", {
      error: error instanceof Error ? error.message : String(error),
      organizationId,
      userId,
    });
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
      logger.warn("Failed to queue new-device notification", {
        error: error instanceof Error ? error.message : String(error),
        userId: params.userId,
      });
    });
}

const authConfig = {
  advanced: {
    cookies: {
      session_token: {
        attributes: {
          httpOnly: true,
        },
        name: "session_token_v1",
      },
    },
    database: {
      generateId: (options) => generateIdForModel(options.model),
    },
    // `secure` is auto-detected from baseURL scheme (https → secure).
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
    },
  },
  appName: env.APP_NAME,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  databaseHooks: {
    session: {
      create: {
        before: async (session, context) => {
          // User status checks (deleted, inactive, locked) live in loginSecurityPlugin;
          // this hook only handles platform detection and session configuration.
          const userAgent = context?.headers?.get("user-agent") ?? null;
          const ipAddress = resolveClientIp(context?.headers);
          const platform = detectPlatform(userAgent);
          const config = SESSION_CONFIG[platform];

          // Single session per user: revoke any existing rows before inserting.
          // RETURNING feeds new-device detection, saving a separate SELECT;
          // the membership lookup is independent, so both run concurrently.
          const [revokedSessions, orgContext] = await Promise.all([
            db
              .delete(schema.sessions)
              .where(eq(schema.sessions.userId, session.userId))
              .returning({
                createdAt: schema.sessions.createdAt,
                ipAddress: schema.sessions.ipAddress,
                userAgent: schema.sessions.userAgent,
              }),
            resolveInitialOrganizationContext(session.userId),
          ]);

          const [previousSession] = revokedSessions.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );

          if (previousSession) {
            const isNewDevice =
              previousSession.userAgent !== userAgent ||
              previousSession.ipAddress !== ipAddress;

            if (isNewDevice) {
              queueNewDeviceNotification({
                ipAddress,
                platform,
                userAgent,
                userId: session.userId,
              });
            }
          }

          const expiresAt = new Date(Date.now() + config.expiresIn * 1000);

          return {
            data: {
              ...session,
              expiresAt,
              platform,
              ...(orgContext ?? {}),
            },
          };
        },
      },
      update: {
        before: async (session, context) => {
          const parsedUpdate = sessionUpdateInputSchema.safeParse(session);
          const activeOrganizationId = parsedUpdate.success
            ? parsedUpdate.data.activeOrganizationId
            : undefined;

          if (activeOrganizationId !== undefined) {
            const newOrgId = activeOrganizationId;

            if (!newOrgId) {
              return {
                data: { ...session, activeOrgRole: null },
              };
            }

            const userId = getSessionUserId(context);

            if (userId) {
              const activeOrgRole = await resolveActiveOrganizationRole(
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

          // Only intervene when Better Auth is refreshing the session expiry;
          // other updates (updatedAt, ipAddress) must pass through unchanged.
          if (!session.expiresAt) {
            return { data: session };
          }

          // The update payload omits session id/token, so we cannot look up the row.
          // Re-detect platform from the request UA (same heuristic as the create hook).
          const userAgent = context?.headers?.get("user-agent") ?? null;
          const platform = detectPlatform(userAgent);

          if (platform === "web") {
            return {
              data: {
                ...session,
                expiresAt: new Date(
                  Date.now() + SESSION_CONFIG.web.expiresIn * 1000
                ),
              },
            };
          }

          return { data: session };
        },
      },
    },
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            failedLoginAttempts: 0,
            roleSlugs: [SYSTEM_ROLES.USER.slug],
            status: "active",
            twoFactorEnabled: false,
          },
        }),
      },
    },
  },

  emailAndPassword: {
    disableSignUp: !env.ENABLE_SIGNUP,
    enabled: true,
    // Password reset uses emailOTP plugin, not magic links.
    password: {
      hash: async (password: string) => await hashPassword(password),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        verifyPasswordHash(hash, password),
    },
    requireEmailVerification: true,
  },

  plugins: [
    enhancedUserPlugin(),
    loginSecurityPlugin(),
    adminPlugin(),
    // Email OTP: powers password reset and email verification (no magic links).
    emailOTP({
      expiresIn: TWO_FACTOR_CONFIG.emailOtpExpiresIn,
      otpLength: TWO_FACTOR_CONFIG.otpLength,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const user = await db.query.users.findFirst({
          columns: { name: true },
          where: { email: { eq: email } },
        });

        const typeLabels: Record<typeof type, string> = {
          "change-email": "email change",
          "email-verification": "email verification",
          "forget-password": "password reset",
          "sign-in": "sign-in",
        };

        const subjectByType: Record<typeof type, string> = {
          "change-email": "Confirm Email Change",
          "email-verification": "Verify Your Email",
          "forget-password": "Reset Your Password",
          "sign-in": "Sign In Verification",
        };

        logger.info(`Sending ${typeLabels[type]} OTP to ${maskEmail(email)}`);

        const templateType =
          type === "change-email" ? "email-verification" : type;

        // Do not await: prevents timing attacks that could leak email existence.
        sendEmail({
          props: {
            expiresIn: `${Math.floor(TWO_FACTOR_CONFIG.emailOtpExpiresIn / 60)} minutes`,
            otp,
            type: templateType,
            userName: user?.name ?? "User",
          },
          subject: subjectByType[type],
          template: VerificationOtpEmail,
          to: email,
        }).catch((error) => {
          logger.error("Failed to send verification OTP email", {
            email: maskEmail(email),
            error: error instanceof Error ? error.message : String(error),
            type,
          });
        });
      },
    }),
    // Two-factor: email OTP only - no TOTP authenticator support.
    twoFactor({
      otpOptions: {
        period: TWO_FACTOR_CONFIG.twoFactorOtpPeriodMinutes,
        async sendOTP({ user, otp }, ctx) {
          logger.info(`Sending 2FA OTP to ${maskEmail(user.email)}`);

          const ipAddress = sanitizeHeaderText(
            ctx?.headers?.get("x-forwarded-for") ?? undefined,
            64
          );
          const userAgent = sanitizeHeaderText(
            ctx?.headers?.get("user-agent") ?? undefined,
            200
          );

          // Do not await: prevents timing attacks that could leak email existence.
          sendEmail({
            props: {
              expiresIn: `${TWO_FACTOR_CONFIG.twoFactorOtpPeriodMinutes} minutes`,
              ipAddress,
              otp,
              userAgent,
              userName: user.name,
            },
            subject: "Your Two-Factor Authentication Code",
            template: TwoFactorOtpEmail,
            to: user.email,
          }).catch((error) => {
            logger.error("Failed to send 2FA OTP email", {
              email: maskEmail(user.email),
              error: error instanceof Error ? error.message : String(error),
              userId: user.id,
            });
          });
        },
      },
      // TOTP would force a verify step on enable; we use email OTP so skip it.
      skipVerificationOnEnable: true,
      twoFactorTable: "twoFactors",
    }),
    openAPI({
      disableDefaultReference: true,
    }),
    {
      $Infer: {} as {
        Session: {
          user: User & UserWithStatusFields;
          session: Session & SessionWithAdditionalFields;
        };
      },
      id: "override-type",
    },
  ],

  // Global rate-limit must sit above the per-account lockout so our lockout fires first.
  // customStorage (not secondaryStorage): secondaryStorage would also move session
  // storage into Redis and break DB-row-based single-session enforcement.
  rateLimit: {
    enabled: true,
    max: RATE_LIMIT_CONFIG.global.max,
    window: RATE_LIMIT_CONFIG.global.window,
    ...(isRedisEnabled()
      ? {
          customStorage: createRedisRateLimitStorage(
            getRedis,
            RATE_LIMIT_CONFIG.global.window
          ),
        }
      : { storage: "memory" as const }),
    customRules: {
      "/sign-in/email": {
        max: RATE_LIMIT_CONFIG.signIn.max,
        window: RATE_LIMIT_CONFIG.signIn.window,
      },
    },
  },
  secret: env.BETTER_AUTH_SECRET,

  session: {
    additionalFields: {
      activeOrganizationId: {
        required: false,
        type: "string",
      },
      activeOrgRole: {
        required: false,
        type: "string",
      },
      platform: {
        defaultValue: "web",
        required: false,
        type: [...platformSchema.options],
      },
    },
    // Cache the resolved session in a signed, short-TTL cookie so getSession()
    // (called on every request via authContextMiddleware) reads the cookie
    // instead of hitting Postgres. maxAge is deliberately short (60s): with
    // single-session-per-user revocation, a cached cookie can outlive a revoked
    // session or stale roleSlugs by at most this window.
    cookieCache: {
      enabled: true,
      maxAge: 60,
    },
    // Use mobile defaults so cookie Max-Age matches the 7-day mobile session.
    // Web sessions get a shorter expiry via the database hooks below.
    expiresIn: SESSION_CONFIG.mobile.expiresIn,
    updateAge: SESSION_CONFIG.mobile.updateAge,
  },
  // Mobile clients must send an explicit Origin header included in CORS_ORIGIN.
  // detectPlatform() is used for session lifetimes only and never for trust.
  trustedOrigins: env.CORS_ORIGIN,
} satisfies BetterAuthOptions;

export const auth = betterAuth(authConfig);
