import {
  emailOTPClient,
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const { origin, pathname } = new URL(import.meta.env.VITE_SERVER_URL);

export const authClient = createAuthClient({
  basePath: pathname === "/" ? "/api/auth" : `${pathname}/api/auth`,
  baseURL: origin,
  plugins: [
    emailOTPClient(),
    organizationClient(),
    twoFactorClient(),
    inferAdditionalFields({
      session: {
        activeOrgRole: { type: "string" },
        platform: { type: "string" },
      },

      user: {
        deactivatedAt: { input: false, type: "date" },
        deactivatedBy: { input: false, type: "string" },
        deactivatedReason: { input: false, type: "string" },
        failedLoginAttempts: { input: false, type: "number" },
        lockedUntil: { input: false, type: "date" },
        permissions: { input: false, type: "string[]" },
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
