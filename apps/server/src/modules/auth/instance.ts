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

// Platform-specific session durations
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

// Regex patterns at top-level for performance
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

// Shape of the session update payload we care about. Unknown fields pass
// through; we only read `activeOrganizationId` explicitly.
const sessionUpdateInputSchema = z
  .object({
    activeOrganizationId: z.string().nullable().optional(),
  })
  .loose();

// Extract the user id from Better Auth's endpoint context. The context is
// typed as `unknown` by the SDK; we defensively walk the tree and narrow.
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
  // During initialization or auth.api calls, request is undefined
  if (!request) {
    return env.CORS_ORIGIN;
  }

  const userAgent = request.headers.get("user-agent");
  const origin = request.headers.get("origin");

  // If request has a valid origin, check against CORS_ORIGIN
  if (origin) {
    return env.CORS_ORIGIN;
  }

  // For mobile clients (no origin header), verify via user-agent
  // and return an empty array to signal "trust this request"
  if (userAgent && detectPlatform(userAgent) === "mobile") {
    // Return the request URL origin to allow the request
    // This is safe because we verified it's a mobile client
    const url = new URL(request.url);
    return [url.origin];
  }

  // Default: use configured CORS origins
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
  // Dynamic trustedOrigins to support both web and mobile clients
  // Mobile apps don't send Origin headers, so we detect them via user-agent
  trustedOrigins: (request: Request | undefined) =>
    resolveTrustedOrigins(request),

  // Rate limiting - set higher than lockout to ensure our custom lockout kicks in first
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
    // Self-signup enabled for mobile onboarding flow
    disableSignUp: false,
    requireEmailVerification: true,
    // Password reset is handled via emailOTP plugin instead of magic links
    password: {
      hash: async (password: string) => await hashPassword(password),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        verifyPasswordHash(hash, password),
    },
  },

  session: {
    // Use mobile defaults so cookie Max-Age matches 7-day mobile sessions.
    // Web sessions are shortened in database hooks.
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
    // secure flag is auto-detected from baseURL (https = secure, http = not)
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
        // Assign default role, status, and force 2FA on user creation
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
          // Note: User status checks (deleted, inactive, locked) are handled by loginSecurityPlugin
          // This hook handles platform detection and session configuration

          // Platform detection and session configuration
          const userAgent = context?.headers?.get("user-agent") ?? null;
          const ipAddress = resolveClientIp(context?.headers);
          const platform = detectPlatform(userAgent);
          const config = SESSION_CONFIG[platform];

          // Query existing session for new-device detection
          const [previousSession] = await db
            .select({
              userAgent: schema.sessions.userAgent,
              ipAddress: schema.sessions.ipAddress,
            })
            .from(schema.sessions)
            .where(eq(schema.sessions.userId, session.userId))
            .limit(1);

          // Revoke existing sessions for this user (single session per user)
          await db
            .delete(schema.sessions)
            .where(eq(schema.sessions.userId, session.userId));

          // Detect new device and send notification
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

          // Calculate expiration based on platform
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

          // Only intervene when Better Auth is refreshing the session expiry.
          // Other updates (e.g. updatedAt, ipAddress) should pass through.
          if (!session.expiresAt) {
            return { data: session };
          }

          // Detect platform from the request user-agent. The update hook only
          // receives the update payload (expiresAt, updatedAt) without the
          // session id or token, so we cannot look up the session row. Instead,
          // use the same user-agent detection as the create hook -- the request
          // that triggered the refresh carries the mobile client's user-agent.
          const userAgent = context?.headers?.get("user-agent") ?? null;
          const platform = detectPlatform(userAgent);

          // Web sessions get shorter expiry; mobile uses the global default (7 days)
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
    // Email OTP plugin for password reset via OTP (not magic links)
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

        logger.info(`Sending ${typeLabels[type]} OTP to ${email}`);

        // Map change-email to email-verification for the template
        const templateType =
          type === "change-email" ? "email-verification" : type;

        // Send email without awaiting to prevent timing attacks
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
            email,
            type,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
    }),
    // Two-factor authentication plugin (email OTP only, no TOTP)
    twoFactor({
      // Use our custom twoFactor table
      twoFactorTable: "twoFactors",
      // Skip TOTP verification since we only use email OTP
      skipVerificationOnEnable: true,
      // OTP configuration for 2FA verification
      otpOptions: {
        // OTP expires in 3 minutes
        period: TWO_FACTOR_CONFIG.twoFactorOtpPeriodMinutes,
        async sendOTP({ user, otp }, ctx) {
          logger.info(`Sending 2FA OTP to ${user.email}`);

          // Extract device info from context if available
          const ipAddress = ctx?.headers?.get("x-forwarded-for") ?? undefined;
          const userAgent = ctx?.headers?.get("user-agent") ?? undefined;

          // Send email without awaiting to prevent timing attacks
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
              email: user.email,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        },
      },
    }),
    openAPI({
      disableDefaultReference: true,
    }),
    // override type
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
