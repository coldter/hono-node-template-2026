import type { HttpBindings } from "@hono/node-server";
import type { AuthSession, AuthUser, auth } from "@/modules/auth/instance";

/**
 * Set node server bindings.
 *
 * @link https://hono.dev/docs/getting-started/nodejs#access-the-raw-node-js-apis
 */
type Bindings = HttpBindings & {
  /* ... */
};

/**
 * Define the context environment.
 *
 * Uses better-auth's inferred types for full type safety.
 *
 * @link https://hono.dev/docs/middleware/builtin/context-storage#usage
 */
export type Env = {
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    otel: { traceId: string | null; spanId: string | null } | null;
  };
  Bindings: Bindings;
};

// Re-export auth types for convenience
export type { AuthSession, AuthUser };
