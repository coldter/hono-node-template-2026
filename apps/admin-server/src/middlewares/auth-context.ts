/**
 * Per-request operator-principal seeding.
 *
 * Defense-in-depth complement to the BA `session.create.before` gate: even
 * if the gate were to regress and let a non-operator user open a session,
 * this middleware will still return `principal = null` for any session
 * whose `operatorId`/`operatorSubRole` slots are missing. Downstream
 * `requireOperator(action)` then fails closed.
 */

import type { OperatorSubRole } from "@repo/authorization";
import { createMiddleware } from "hono/factory";
import type { Env, OperatorPrincipal } from "@/lib/context";
import type {
  AdminAuthInstance,
  AdminAuthSession,
} from "@/modules/auth/instance";

async function readOperatorSession(
  auth: AdminAuthInstance,
  req: Request
): Promise<AdminAuthSession | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return null;
  }
  // boundary: vendor-SDK generic variance — BA's natural `getSession`
  // inference doesn't carry the `operator-session-override-type` plugin
  // `$Infer`; a single-step `as AdminAuthSession` narrows the structurally
  // compatible shape without a `unknown` middleman.
  return session as AdminAuthSession;
}

const VALID_SUB_ROLES: ReadonlySet<OperatorSubRole> = new Set<OperatorSubRole>([
  "platform_admin",
  "support",
  "read_only",
]);

function isOperatorSubRole(value: string): value is OperatorSubRole {
  return (VALID_SUB_ROLES as ReadonlySet<string>).has(value);
}

function toOperatorPrincipal(
  session: AdminAuthSession | null
): OperatorPrincipal | null {
  if (!session) {
    return null;
  }
  // The `operator-session-override-type` plugin's `$Infer` types the
  // `operatorId` and `operatorSubRole` fields directly on the session, so
  // no widening cast is needed — read them through the typed shape and
  // still guard at runtime as defense-in-depth.
  const { operatorId, operatorSubRole } = session.session;
  const userEmail =
    typeof session.user.email === "string" ? session.user.email : "";
  if (typeof operatorId !== "string" || typeof operatorSubRole !== "string") {
    return null;
  }
  if (!isOperatorSubRole(operatorSubRole)) {
    return null;
  }
  return {
    kind: "operator",
    operator: {
      id: operatorId,
      subRole: operatorSubRole,
      email: userEmail,
    },
  };
}

/**
 * Factory mirrors `apps/server`'s `buildAuthContextMiddleware`: keeps the
 * heavy BA factory out of the middleware module and lets tests inject a
 * stub instance.
 */
export function buildAuthContextMiddleware(
  authFactory: () => AdminAuthInstance
) {
  return createMiddleware<Env>(async (c, next) => {
    const current = c.var.requestContext;
    const auth = authFactory();
    const session = await readOperatorSession(auth, c.req.raw);
    const principal = toOperatorPrincipal(session);
    c.set("requestContext", { ...current, principal });
    return next();
  });
}
