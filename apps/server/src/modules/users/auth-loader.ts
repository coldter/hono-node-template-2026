import { users } from "@repo/db/schema";
import type { UserAuthorizationResource } from "@repo/shared/authorization";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { getAuthorizedResource } from "@/auth/middleware";
import { db } from "@/db";
import type { Env } from "@/lib/context";

export async function loadUserResource(
  c: Context<Env>
): Promise<UserAuthorizationResource | null> {
  const userId = c.req.param("userId");
  if (!userId) {
    return null;
  }
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export function requireAuthorizedUserId(c: Context<Env>): string {
  return getAuthorizedResource<UserAuthorizationResource>(c).id;
}
