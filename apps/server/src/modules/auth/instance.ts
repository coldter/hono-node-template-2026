import { generateIdForModel } from "@repo/db/ids";
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
import { resolveClientIpFromHeaders } from "@/lib/ip";
import { logger } from "@/lib/logger";
import { getRedis, isRedisEnabled } from "@/lib/redis";
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

type SessionInference = {
  Session: {
    user: User & UserWithStatusFields;
    session: Session & SessionWithAdditionalFields;
  };
};

type EndpointContext = {
  context?: {
    session?: {
      user?: { id?: string } | null;
    } | null;
  };
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

function getSessionUserId(
  ctx: EndpointContext | null | undefined
): string | undefined {
  const parsed = endpointCtxSchema.safeParse(ctx);
  if (!parsed.success) {
    return;
  }
  return parsed.data.context?.session?.user?.id;
}

function resolveClientIp(headers: Headers | undefined): string | null {
  return resolveClientIpFromHeaders(headers, env.TRUST_PROXY);
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
    return undefined;
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

    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
    },
    disableOriginCheck: false,
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
          const userAgent = context?.headers?.get("user-agent") ?? null;
          const ipAddress = resolveClientIp(context?.headers);
          const platform = detectPlatform(userAgent);
          const config = SESSION_CONFIG[platform];

          const orgContextPromise = resolveInitialOrganizationContext(
            session.userId
          );

          let previousSession:
            | {
                createdAt: Date;
                ipAddress: string | null;
                userAgent: string | null;
              }
            | undefined;

          if (env.AUTH_SINGLE_SESSION) {
            const revokedSessions = await db
              .delete(schema.sessions)
              .where(eq(schema.sessions.userId, session.userId))
              .returning({
                createdAt: schema.sessions.createdAt,
                ipAddress: schema.sessions.ipAddress,
                userAgent: schema.sessions.userAgent,
              });

            [previousSession] = revokedSessions.sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
            );
          } else {
            const [latest] = await db
              .select({
                createdAt: schema.sessions.createdAt,
                ipAddress: schema.sessions.ipAddress,
                userAgent: schema.sessions.userAgent,
              })
              .from(schema.sessions)
              .where(eq(schema.sessions.userId, session.userId))
              .orderBy(desc(schema.sessions.createdAt))
              .limit(1);

            previousSession = latest ?? undefined;
          }

          const orgContext = await orgContextPromise;

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
                return { data: { ...session, activeOrgRole: null } };
              }

              return {
                data: {
                  ...session,
                  activeOrgRole,
                },
              };
            }

            return { data: { ...session, activeOrgRole: null } };
          }

          if (!session.expiresAt) {
            return { data: session };
          }

          const persistedPlatform = platformSchema
            .catch("web")
            .parse(session.platform);

          if (persistedPlatform === "web") {
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
        before: async (user) => {
          const email = z.string().safeParse(user.email);
          return {
            data: {
              ...user,
              email: email.success
                ? email.data.trim().toLowerCase()
                : user.email,
              failedLoginAttempts: 0,
              roleSlugs: [SYSTEM_ROLES.USER.slug],
              status: "active",
              twoFactorEnabled: false,
            },
          };
        },
      },
      update: {
        after: async (user, context) => {
          try {
            const { auditLogService } = await import(
              "@/modules/audit-logs/service"
            );
            const { AUDIT_EVENTS, TARGET_TYPES } = await import(
              "@/modules/audit-logs/constants"
            );
            const parsedUserId = z.string().safeParse(user?.id);
            if (!(parsedUserId.success && parsedUserId.data)) {
              return;
            }
            const userId = parsedUserId.data;
            const actorId = getSessionUserId(context) ?? userId;
            await auditLogService.create({
              actorId,
              actorType: "user",
              event: AUDIT_EVENTS.USER.UPDATED.event,
              targetId: userId,
              targetType: TARGET_TYPES.USER,
            });
          } catch (error) {
            logger.warn("Failed to audit profile update", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      },
    },
  },

  emailAndPassword: {
    disableSignUp: !env.ENABLE_SIGNUP,
    enabled: true,

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

      skipVerificationOnEnable: true,
      twoFactorTable: "twoFactor",
    }),
    openAPI({
      disableDefaultReference: true,
    }),
    {
      // SAFETY: better-auth reads `$Infer` only at the type level, so this runtime value is intentionally empty.
      $Infer: {} as SessionInference,
      id: "override-type",
    },
  ],

  rateLimit: {
    customRules: {
      "/sign-in/email": {
        max: RATE_LIMIT_CONFIG.signIn.max,
        window: RATE_LIMIT_CONFIG.signIn.window,
      },
    },
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
  },
  secret: env.BETTER_AUTH_SECRET,

  session: {
    additionalFields: {
      activeOrganizationId: {
        input: false,
        required: false,
        type: "string",
      },
      activeOrgRole: {
        input: false,
        required: false,
        type: "string",
      },
      platform: {
        defaultValue: "web",
        input: false,
        required: false,
        type: [...platformSchema.options],
      },
    },

    cookieCache: {
      enabled: false,
      maxAge: 60,
    },

    expiresIn: SESSION_CONFIG.mobile.expiresIn,
    updateAge: SESSION_CONFIG.mobile.updateAge,
  },

  trustedOrigins: env.CORS_ORIGIN,
} satisfies BetterAuthOptions;

export const auth = betterAuth(authConfig);
