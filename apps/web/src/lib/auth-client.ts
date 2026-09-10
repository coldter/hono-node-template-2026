import {
  emailOTPClient,
  inferAdditionalFields,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const { origin, pathname } = new URL(import.meta.env.VITE_SERVER_URL);

export const authClient = createAuthClient({
  basePath: pathname === "/" ? "/api/auth" : `${pathname}/api/auth`,
  baseURL: origin,
  plugins: [
    emailOTPClient(),
    twoFactorClient(),
    inferAdditionalFields({
      session: {
        activeOrganizationId: { input: false, type: "string" },
        activeOrgRole: { input: false, type: "string" },
        platform: { input: false, type: "string" },
      },

      user: {
        deactivatedAt: { input: false, type: "date" },
        deactivatedBy: { input: false, type: "string" },
        deactivatedReason: { input: false, type: "string" },
        failedLoginAttempts: { input: false, type: "number" },
        lockedUntil: { input: false, type: "date" },
        onboardingCompletedAt: { input: false, type: "date" },
        roleSlugs: { input: false, type: "string[]" },
        status: { input: false, type: "string" },
        twoFactorEnabled: { input: false, type: "boolean" },
      },
    }),
  ],
});

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];
export type SessionData = Session["session"];
