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
import { adminPlugin } from "@/modules/auth/plugins/admin";
import { loginSecurityPlugin } from "@/modules/auth/plugins/login-security";
import {
  enhancedUserPlugin,
  type UserWithStatusFields,
} from "@/modules/auth/plugins/user-status";
import { SYSTEM_ROLES } from "@/modules/auth/roles";
import { RATE_LIMIT_CONFIG, TWO_FACTOR_CONFIG } from "./constants";
import { hashPassword, verifyPasswordHash } from "./helpers/argon2id";

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

function resolveTrustedOrigins(request: Request | undefined): string[] {
  // request is undefined during initialization or auth.api calls
  if (!request) {
    return env.CORS_ORIGIN;
  }

  const userAgent = request.headers.get("user-agent");
  const origin = request.headers.get("origin");

  if (origin) {
    return env.CORS_ORIGIN;
  }

  // Mobile clients send no Origin header; trust the request URL origin
  // only after verifying a mobile UA so this cannot be spoofed by browsers.
  if (userAgent && detectPlatform(userAgent) === "mobile") {
    const url = new URL(request.url);
    return [url.origin];
  }

  return env.CORS_ORIGIN;
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
      logger.warn("Failed to queue new-device notification", {
        userId: params.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

const authConfig = {
  appName: env.APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema,
  }),
  // Mobile clients send no Origin header; resolveTrustedOrigins detects them via user-agent.
  trustedOrigins: (request: Request | undefined) =>
    resolveTrustedOrigins(request),

  // Global rate-limit must sit above the per-account lockout so our lockout fires first.
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
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: true,
    // Password reset uses emailOTP plugin, not magic links.
    password: {
      hash: async (password: string) => await hashPassword(password),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        verifyPasswordHash(hash, password),
    },
  },

  session: {
    // Use mobile defaults so cookie Max-Age matches the 7-day mobile session.
    // Web sessions get a shorter expiry via the database hooks below.
    expiresIn: SESSION_CONFIG.mobile.expiresIn,
    updateAge: SESSION_CONFIG.mobile.updateAge,
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
    // `secure` is auto-detected from baseURL scheme (https → secure).
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
    database: {
      generateId: (options) => generateIdForModel(options.model),
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            ...user,
            roleSlugs: [SYSTEM_ROLES.USER.slug],
            status: "active",
            failedLoginAttempts: 0,
            twoFactorEnabled: false,
          },
        }),
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          // User status checks (deleted, inactive, locked) live in loginSecurityPlugin;
          // this hook only handles platform detection and session configuration.
          const userAgent = context?.headers?.get("user-agent") ?? null;
          const ipAddress = resolveClientIp(context?.headers);
          const platform = detectPlatform(userAgent);
          const config = SESSION_CONFIG[platform];

          const [previousSession] = await db
            .select({
              userAgent: schema.sessions.userAgent,
              ipAddress: schema.sessions.ipAddress,
            })
            .from(schema.sessions)
            .where(eq(schema.sessions.userId, session.userId))
            .limit(1);

          // Single session per user: revoke any existing rows before inserting.
          await db
            .delete(schema.sessions)
            .where(eq(schema.sessions.userId, session.userId));

          if (previousSession) {
            const isNewDevice =
              previousSession.userAgent !== userAgent ||
              previousSession.ipAddress !== ipAddress;

            if (isNewDevice) {
              queueNewDeviceNotification({
                userId: session.userId,
                ipAddress,
                userAgent,
                platform,
              });
            }
          }

          const expiresAt = new Date(Date.now() + config.expiresIn * 1000);

          const orgContext = await resolveInitialOrganizationContext(
            session.userId
          );

          return {
            data: {
              ...session,
              platform,
              expiresAt,
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
  },

  plugins: [
    enhancedUserPlugin(),
    loginSecurityPlugin(),
    adminPlugin(),
    // Email OTP: powers password reset and email verification (no magic links).
    emailOTP({
      otpLength: TWO_FACTOR_CONFIG.otpLength,
      expiresIn: TWO_FACTOR_CONFIG.emailOtpExpiresIn,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const user = await db.query.users.findFirst({
          where: { email: { eq: email } },
          columns: { name: true },
        });

        const typeLabels: Record<typeof type, string> = {
          "sign-in": "sign-in",
          "email-verification": "email verification",
          "forget-password": "password reset",
          "change-email": "email change",
        };

        const subjectByType: Record<typeof type, string> = {
          "forget-password": "Reset Your Password",
          "email-verification": "Verify Your Email",
          "sign-in": "Sign In Verification",
          "change-email": "Confirm Email Change",
        };

        logger.info(`Sending ${typeLabels[type]} OTP to ${maskEmail(email)}`);

        const templateType =
          type === "change-email" ? "email-verification" : type;

        // Do not await: prevents timing attacks that could leak email existence.
        sendEmail({
          to: email,
          subject: subjectByType[type],
          template: VerificationOtpEmail,
          props: {
            userName: user?.name ?? "User",
            otp,
            type: templateType,
            expiresIn: `${Math.floor(TWO_FACTOR_CONFIG.emailOtpExpiresIn / 60)} minutes`,
          },
        }).catch((error) => {
          logger.error("Failed to send verification OTP email", {
            email: maskEmail(email),
            type,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
    }),
    // Two-factor: email OTP only — no TOTP authenticator support.
    twoFactor({
      twoFactorTable: "twoFactors",
      // TOTP would force a verify step on enable; we use email OTP so skip it.
      skipVerificationOnEnable: true,
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
            to: user.email,
            subject: "Your Two-Factor Authentication Code",
            template: TwoFactorOtpEmail,
            props: {
              userName: user.name,
              otp,
              expiresIn: `${TWO_FACTOR_CONFIG.twoFactorOtpPeriodMinutes} minutes`,
              ipAddress,
              userAgent,
            },
          }).catch((error) => {
            logger.error("Failed to send 2FA OTP email", {
              userId: user.id,
              email: maskEmail(user.email),
              error: error instanceof Error ? error.message : String(error),
            });
          });
        },
      },
    }),
    openAPI({
      disableDefaultReference: true,
    }),
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

export const auth = betterAuth(authConfig);
