import type { Principal } from "@repo/authorization";
import {
  createAuthorize,
  getAuthorizedResource,
} from "@repo/authorization/hono";
import {
  buildAuthorizationPrincipal,
  toBaseAuthorizationPrincipal,
} from "@repo/shared/authorization";
import type { Context } from "hono";
import type { Env } from "@/lib/context";
import { authorization } from "./registry";

export function resolvePrincipalFromContext(c: Context<Env>): Principal | null {
  return resolvePrincipal(c);
}

function resolvePrincipal(c: Context<Env>): Principal | null {
  const user = c.get("user");
  if (!user) {
    return null;
  }
  return toBaseAuthorizationPrincipal(
    buildAuthorizationPrincipal(user, c.get("session") ?? {})
  );
}

export const authorize = createAuthorize<typeof authorization.resources, Env>(
  authorization,
  { resolvePrincipal }
);

export { getAuthorizedResource };
