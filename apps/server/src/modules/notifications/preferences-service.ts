import {
  type NewNotificationPreference,
  notificationPreferences,
} from "@repo/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { db, type Executor } from "@/db";
import type { PreferencesRecord, UpdatePreferencesInput } from "./types";

export const notificationPreferencesService = {
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
          pushEnabled: true,
          smsEnabled: false,
        },
        executor
      );
    }
    return existing;
  },
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
          emailEnabled: input.emailEnabled ?? true,
          pushEnabled: input.pushEnabled ?? true,
          smsEnabled: input.smsEnabled ?? false,
          typePattern: "*",
          userId,
        },
      ];

      if (input.typeOverrides) {
        for (const [typePattern, override] of Object.entries(
          input.typeOverrides
        )) {
          const channels = override.channels ?? [];
          values.push({
            emailEnabled: channels.includes("email"),
            pushEnabled: channels.includes("push"),
            smsEnabled: channels.includes("sms"),
            typePattern,
            userId,
          });
        }
      }

      await tx
        .insert(notificationPreferences)
        .values(values)
        .onConflictDoUpdate({
          set: {
            emailEnabled: sql`EXCLUDED.email_enabled`,
            pushEnabled: sql`EXCLUDED.push_enabled`,
            smsEnabled: sql`EXCLUDED.sms_enabled`,
          },
          target: [
            notificationPreferences.userId,
            notificationPreferences.typePattern,
          ],
        });

      return tx
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .orderBy(asc(notificationPreferences.typePattern));
    });
  },
};
