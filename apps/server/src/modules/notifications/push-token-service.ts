import { pushTokens } from "@repo/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db } from "@/db";
import type { PushTokenRecord, RegisterPushTokenInput } from "./types";

export const notificationPushTokenService = {
  async listPushTokens(userId: string): Promise<PushTokenRecord[]> {
    return db
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true)))
      .orderBy(desc(pushTokens.createdAt));
  },

  async registerPushToken(
    userId: string,
    sessionId: string,
    input: RegisterPushTokenInput
  ): Promise<PushTokenRecord> {
    // Cross-user check to prevent silent token take-over.
    const [conflicting] = await db
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.token, input.token))
      .limit(1);

    if (conflicting && conflicting.userId !== userId) {
      throw new HTTPException(409, {
        message: "Token already registered to a different user",
      });
    }

    const [existing] = await db
      .select()
      .from(pushTokens)
      .where(
        and(eq(pushTokens.token, input.token), eq(pushTokens.userId, userId))
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(pushTokens)
        .set({
          userId,
          sessionId,
          platform: input.platform,
          deviceId: input.deviceId ?? existing.deviceId,
          deviceName: input.deviceName ?? existing.deviceName,
          isActive: true,
          lastUsedAt: new Date(),
        })
        .where(eq(pushTokens.id, existing.id))
        .returning();
      return updated ?? existing;
    }

    const [newToken] = await db
      .insert(pushTokens)
      .values({
        userId,
        sessionId,
        token: input.token,
        platform: input.platform,
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        isActive: true,
      })
      .returning();

    if (!newToken) {
      throw new Error("Failed to create push token");
    }

    return newToken;
  },

  async deactivatePushToken(tokenId: string, userId: string): Promise<boolean> {
    const result = await db
      .update(pushTokens)
      .set({ isActive: false })
      .where(and(eq(pushTokens.id, tokenId), eq(pushTokens.userId, userId)))
      .returning({ id: pushTokens.id });
    return result.length > 0;
  },

  async deletePushTokenByToken(token: string): Promise<boolean> {
    const result = await db
      .delete(pushTokens)
      .where(eq(pushTokens.token, token))
      .returning({ id: pushTokens.id });
    return result.length > 0;
  },
};
