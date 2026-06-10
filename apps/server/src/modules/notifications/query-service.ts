import { notifications } from "@repo/db/schema";
import { and, count, eq, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  buildOrderBy,
  createPaginatedResponse,
  getPaginationParams,
} from "@/utils/pagination";
import { NOTIFICATIONS_SORT_COLUMNS } from "./constants";
import type { ListNotificationsQuery, NotificationRecord } from "./types";

const SORT_COLUMNS = {
  [NOTIFICATIONS_SORT_COLUMNS.createdAt]: notifications.createdAt,
  [NOTIFICATIONS_SORT_COLUMNS.status]: notifications.status,
  [NOTIFICATIONS_SORT_COLUMNS.type]: notifications.type,
} as const;

function buildUnreadConditions(): SQL[] {
  return [
    eq(notifications.channel, "push"),
    sql`${notifications.readAt} IS NULL`,
    sql`${notifications.status} IN ('sent', 'delivered')`,
  ];
}

export const notificationQueryService = {
  async listByUser(userId: string, query: ListNotificationsQuery) {
    const { perPage, offset, sort, order } = getPaginationParams(query);

    const conditions: SQL[] = [eq(notifications.userId, userId)];

    if (query.type) {
      conditions.push(eq(notifications.type, query.type));
    }

    if (query.status) {
      // Explicit status filter takes precedence over unreadOnly
      conditions.push(eq(notifications.status, query.status));
    } else if (query.unreadOnly) {
      conditions.push(...buildUnreadConditions());
    }

    if (query.channel) {
      conditions.push(eq(notifications.channel, query.channel));
    }

    const where = and(...conditions);

    const [notificationsList, [countResult]] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(
          buildOrderBy(SORT_COLUMNS, sort, order, SORT_COLUMNS.createdAt)
        )
        .limit(perPage)
        .offset(offset),
      db.select({ total: count() }).from(notifications).where(where),
    ]);

    return createPaginatedResponse({
      data: notificationsList,
      total: countResult?.total ?? 0,
      query,
    });
  },

  async findById(notificationId: string): Promise<NotificationRecord | null> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);
    return notification ?? null;
  },

  async findByIdAndUser(
    notificationId: string,
    userId: string
  ): Promise<NotificationRecord | null> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId)
        )
      )
      .limit(1);
    return notification ?? null;
  },

  async getUnreadCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), ...buildUnreadConditions()));
    return result?.count ?? 0;
  },

  async markAsRead(
    notificationId: string,
    userId: string
  ): Promise<NotificationRecord | null> {
    const [updated] = await db
      .update(notifications)
      .set({
        readAt: new Date(),
      })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, userId),
          eq(notifications.channel, "push"),
          sql`${notifications.readAt} IS NULL`
        )
      )
      .returning();
    return updated ?? null;
  },

  async markAllAsRead(userId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({
        readAt: new Date(),
      })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.channel, "push"),
          sql`${notifications.readAt} IS NULL`,
          sql`${notifications.status} IN ('sent', 'delivered')`
        )
      )
      .returning({ id: notifications.id });
    return result.length;
  },
};
