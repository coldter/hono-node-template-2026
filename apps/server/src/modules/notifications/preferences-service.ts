import {
  type NewNotificationPreference,
  notificationPreferences,
} from "@repo/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import type { PreferencesRecord, UpdatePreferencesInput } from "./types";

export const notificationPreferencesService = {
  async getPreferences(userId: string): Promise<PreferencesRecord[]> {
    return db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .orderBy(asc(notificationPreferences.typePattern));
  },

  async updatePreferences(
    userId: string,
    input: UpdatePreferencesInput,
    executor: Executor = db
  ): Promise<PreferencesRecord[]> {
    return executor.transaction(async (tx) => {
      const values: NewNotificationPreference[] = [
        {
          userId,
          typePattern: "*",
          emailEnabled: input.emailEnabled ?? true,
          smsEnabled: input.smsEnabled ?? false,
          pushEnabled: input.pushEnabled ?? true,
        },
      ];

      if (input.typeOverrides) {
        for (const [typePattern, override] of Object.entries(
          input.typeOverrides
        )) {
          const channels = override.channels ?? [];
          values.push({
            userId,
            typePattern,
            emailEnabled: channels.includes("email"),
            smsEnabled: channels.includes("sms"),
            pushEnabled: channels.includes("push"),
          });
        }
      }

      await tx
        .insert(notificationPreferences)
        .values(values)
        .onConflictDoUpdate({
          target: [
            notificationPreferences.userId,
            notificationPreferences.typePattern,
          ],
          set: {
            emailEnabled: sql`EXCLUDED.email_enabled`,
            smsEnabled: sql`EXCLUDED.sms_enabled`,
            pushEnabled: sql`EXCLUDED.push_enabled`,
          },
        });

      return tx
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .orderBy(asc(notificationPreferences.typePattern));
    });
  },

  async ensureDefaultPreferences(
    userId: string,
    executor: Executor = db
  ): Promise<PreferencesRecord[]> {
    const existing =
      await notificationPreferencesService.getPreferences(userId);
    if (existing.length === 0) {
      return notificationPreferencesService.updatePreferences(
        userId,
        {
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: true,
        },
        executor
      );
    }
    return existing;
  },
};
