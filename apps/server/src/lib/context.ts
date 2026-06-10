import type { HttpBindings } from "@hono/node-server";
import type { RequestIdVariables } from "hono/request-id";
import type { AuditContext } from "@/lib/audit-context";
import type { auth } from "@/modules/auth/instance";

/**
 * @link https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis
 */
type Bindings = HttpBindings & {
  /* ... */
};

/**
 * Uses better-auth's inferred types for full type safety.
 *
 * @link https://hono.dev/docs/middleware/builtin/context-storage#usage
 */
export type Env = {
  Variables: RequestIdVariables & {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    otel: { traceId: string | null; spanId: string | null } | null;
    auditContext: AuditContext;
  };
  Bindings: Bindings;
};
