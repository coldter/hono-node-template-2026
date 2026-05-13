import {
  type Argon2idHasher,
  buildArgon2idHasher,
  buildDrizzleAdapter,
  buildIdGenerator,
} from "@repo/auth-tokens";
import type { DrizzleClient } from "@repo/db";
import {
  sendEmail,
  TwoFactorOtpEmail,
  VerificationOtpEmail,
} from "@repo/email";
import { emailOTP, openAPI, twoFactor } from "better-auth/plugins";
import type { Logger } from "winston";
import { env } from "@/env";
import { adminPlugin } from "@/modules/auth/plugins/admin";
import { loginSecurityPlugin } from "@/modules/auth/plugins/login-security";
import { enhancedUserPlugin } from "@/modules/auth/plugins/user-status";
import { TWO_FACTOR_CONFIG } from "./constants";

export type AuthPasswordHasher = Argon2idHasher;

const defaultPasswordHasher: AuthPasswordHasher = buildArgon2idHasher(
  env.BETTER_AUTH_SECRET
);

export type AuthIdGenerator = (options: { model: string }) => string | false;

export type AuthBaseDeps = Readonly<{
  db: DrizzleClient;
  appName: string;
  secret: string;
  logger: Logger;
  /** Override the default argon2id hasher (e.g. for tests). */
  passwordHasher?: AuthPasswordHasher;
  /**
   * Override the default ID generator. Receives BA's `{ model }` argument and
   * returns either a branded ID or `false` to defer to BA's own generator.
   */
  idGenerator?: AuthIdGenerator;
  /**
   * Toggles whether `emailOTP.sendVerificationOnSignUp` runs. Tenant flows
   * keep this on; admin flows may opt out.
   */
  sendVerificationOnSignUp?: boolean;
}>;

/**
 * Shared Better Auth configuration used by both the tenant app and the
 * operator-admin app. Returns a `Partial<BetterAuthOptions>` so callers can
 * spread it and layer their own host policy, plugins, and database hooks.
 *
 * Invariants captured here:
 *   - drizzle adapter (pg, plural, project schema)
 *   - argon2id password hashing
 *   - branded ID generation via `ID_PREFIXES`
 *   - 2FA email OTP and email-verification OTP delivery
 *   - user-status / login-security / admin plugin set
 *   - openAPI doc generation
 *
 * What this does NOT decide (callers own these):
 *   - `baseURL` / `allowedHosts` / `trustedOrigins`
 *   - `disableSignUp` (closed by default in tenant, configurable in admin)
 *   - `session` window and additional fields
 *   - `databaseHooks` (session lifecycle, org context, JWT revocation)
 *   - `plugins`: tenant adds sso/jwt/disable-org-create; admin adds its own
 */
export function createAuthBase(deps: AuthBaseDeps) {
  const log = deps.logger;
  const hasher = deps.passwordHasher ?? defaultPasswordHasher;
  const idGen: AuthIdGenerator = deps.idGenerator ?? buildIdGenerator(log);

  const plugins = [
    enhancedUserPlugin(),
    loginSecurityPlugin(),
    adminPlugin(),
    emailOTP({
      otpLength: TWO_FACTOR_CONFIG.otpLength,
      expiresIn: TWO_FACTOR_CONFIG.emailOtpExpiresIn,
      sendVerificationOnSignUp: deps.sendVerificationOnSignUp ?? true,
      async sendVerificationOTP({ email, otp, type }) {
        const user = await deps.db.query.users.findFirst({
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

        log.info(`Sending ${typeLabels[type]} OTP to ${email}`);

        const templateType =
          type === "change-email" ? "email-verification" : type;

        // Fire-and-forget to keep response timing constant regardless of
        // whether the email account exists.
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
          log.error("Failed to send verification OTP email", {
            email,
            type,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
    }),
    twoFactor({
      twoFactorTable: "twoFactors",
      // Only email OTP is supported; TOTP verification on enable is skipped.
      skipVerificationOnEnable: true,
      otpOptions: {
        period: TWO_FACTOR_CONFIG.twoFactorOtpPeriodMinutes,
        async sendOTP({ user, otp }, ctx) {
          log.info(`Sending 2FA OTP to ${user.email}`);

          const ipAddress = ctx?.headers?.get("x-forwarded-for") ?? undefined;
          const userAgent = ctx?.headers?.get("user-agent") ?? undefined;

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
            log.error("Failed to send 2FA OTP email", {
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
  ] as const;

  return {
    appName: deps.appName,
    secret: deps.secret,
    database: buildDrizzleAdapter(deps.db),
    emailAndPassword: {
      enabled: true,
      password: {
        hash: hasher.hash,
        verify: hasher.verify,
      },
    },
    advanced: {
      database: {
        generateId: idGen,
      },
    },
    plugins,
  };
}
