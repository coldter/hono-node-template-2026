import { pushTokens } from "@repo/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { db, type Executor } from "@/db";
import type { PushTokenRecord, RegisterPushTokenInput } from "./types";

export const notificationPushTokenService = {
  async deactivatePushToken(
    tokenId: string,
    userId: string,
    executor: Executor = db
  ): Promise<boolean> {
    const result = await executor
      .update(pushTokens)
      .set({ isActive: false })
      .where(and(eq(pushTokens.id, tokenId), eq(pushTokens.userId, userId)))
      .returning({ id: pushTokens.id });
    return result.length > 0;
  },

  async deletePushTokenByToken(
    token: string,
    executor: Executor = db
  ): Promise<boolean> {
    const result = await executor
      .delete(pushTokens)
      .where(eq(pushTokens.token, token))
      .returning({ id: pushTokens.id });
    return result.length > 0;
  },
  async listPushTokens(
    userId: string,
    executor: Executor = db
  ): Promise<PushTokenRecord[]> {
    return executor
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.isActive, true)))
      .orderBy(desc(pushTokens.createdAt));
  },

  async registerPushToken(
    userId: string,
    sessionId: string,
    input: RegisterPushTokenInput,
    executor: Executor = db
  ): Promise<PushTokenRecord> {
    const [existing] = await executor
      .select()
      .from(pushTokens)
      .where(eq(pushTokens.token, input.token))
      .limit(1);

    if (existing && existing.userId !== userId) {
      throw new HTTPException(409, {
        message: "Token already registered to a different user",
      });
    }

    if (existing) {
      const [updated] = await executor
        .update(pushTokens)
        .set({
          deviceId: input.deviceId ?? existing.deviceId,
          deviceName: input.deviceName ?? existing.deviceName,
          isActive: true,
          lastUsedAt: new Date(),
          platform: input.platform,
          sessionId,
          userId,
        })
        .where(eq(pushTokens.id, existing.id))
        .returning();
      return updated ?? existing;
    }

    const [newToken] = await executor
      .insert(pushTokens)
      .values({
        deviceId: input.deviceId ?? null,
        deviceName: input.deviceName ?? null,
        isActive: true,
        platform: input.platform,
        sessionId,
        token: input.token,
        userId,
      })
      .returning();

    if (!newToken) {
      throw new Error("Failed to create push token");
    }

    return newToken;
  },
};
