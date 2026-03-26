import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const parsedUrl = new URL(import.meta.env.VITE_SERVER_URL);
const pathname = parsedUrl.pathname;

export const authClient = createAuthClient({
  baseURL: parsedUrl.origin,
  basePath: pathname === "/" ? "/api/auth" : `${pathname}/api/auth`,
  plugins: [
    inferAdditionalFields({
      user: {
        status: { type: "string" },
        deactivatedAt: { type: "date" },
        deactivatedBy: { type: "string" },
        deactivatedReason: { type: "string" },
        failedLoginAttempts: { type: "number" },
        lockedUntil: { type: "date" },
        roleSlugs: { type: "string[]" },
        permissions: { type: "string[]" },
      },
      session: {
        platform: { type: "string" },
      },
    }),
  ],
});

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];
export type SessionData = Session["session"];
