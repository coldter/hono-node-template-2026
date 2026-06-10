import {
  emailOTPClient,
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const parsedUrl = new URL(import.meta.env.VITE_SERVER_URL);
const pathname = parsedUrl.pathname;

export const authClient = createAuthClient({
  baseURL: parsedUrl.origin,
  basePath: pathname === "/" ? "/api/auth" : `${pathname}/api/auth`,
  plugins: [
    emailOTPClient(),
    organizationClient(),
    twoFactorClient(),
    inferAdditionalFields({
      // input: false mirrors the server's user-status plugin so server-managed
      // fields are not demanded in signUp.email's typed body.
      user: {
        status: { type: "string", input: false },
        deactivatedAt: { type: "date", input: false },
        deactivatedBy: { type: "string", input: false },
        deactivatedReason: { type: "string", input: false },
        failedLoginAttempts: { type: "number", input: false },
        lockedUntil: { type: "date", input: false },
        roleSlugs: { type: "string[]", input: false },
        permissions: { type: "string[]", input: false },
        twoFactorEnabled: { type: "boolean", input: false },
      },
      session: {
        platform: { type: "string" },
        activeOrgRole: { type: "string" },
      },
    }),
  ],
});

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];
export type SessionData = Session["session"];
