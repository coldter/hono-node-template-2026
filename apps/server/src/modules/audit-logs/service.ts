import { auditLogs } from "@repo/db/schema";
import { and, count, eq, gte, lte, type SQL, sql } from "drizzle-orm";

import { db, type Executor } from "@/db";
import type {
  CreateAuditLogInput,
  FindAuditLogsQuery,
} from "@/modules/audit-logs/types";
import {
  buildOrderBy,
  createPaginatedResponse,
  getPaginationParams,
} from "@/utils/pagination";

const ALLOWED_SORT_COLUMNS = {
  actorType: auditLogs.actorType,
  createdAt: auditLogs.createdAt,
  event: auditLogs.event,
  ipAddress: auditLogs.ipAddress,
  targetType: auditLogs.targetType,
} as const;

export const auditLogService = {
  async create(input: CreateAuditLogInput, executor: Executor = db) {
    const [log] = await executor
      .insert(auditLogs)
      .values({
        actorId: input.actorId,
        actorType: input.actorType ?? "user",
        event: input.event,
        ipAddress: input.ipAddress,
        metadata: input.metadata,
        targetId: input.targetId,
        targetType: input.targetType,
        userAgent: input.userAgent,
      })
      .returning();
    return log;
  },

  async find(query: FindAuditLogsQuery) {
    const { event, actorId, targetId, targetType, startDate, endDate } = query;
    const { perPage, offset, sort, order } = getPaginationParams(query);

    const conditions: SQL[] = [];

    if (event) {
      if (event.endsWith(".*")) {
        const prefix = event.slice(0, -1);
        conditions.push(sql`${auditLogs.event} LIKE ${`${prefix}%`}`);
      } else {
        conditions.push(sql`${auditLogs.event} = ${event}`);
      }
    }

    if (actorId) {
      conditions.push(eq(auditLogs.actorId, actorId));
    }

    if (targetId) {
      conditions.push(eq(auditLogs.targetId, targetId));
    }

    if (targetType) {
      conditions.push(eq(auditLogs.targetType, targetType));
    }

    if (startDate) {
      conditions.push(gte(auditLogs.createdAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(auditLogs.createdAt, new Date(endDate)));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [countResult]] = await Promise.all([
      db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(
          buildOrderBy(ALLOWED_SORT_COLUMNS, sort, order, auditLogs.createdAt)
        )
        .limit(perPage)
        .offset(offset),
      db.select({ total: count() }).from(auditLogs).where(where),
    ]);

    return createPaginatedResponse({
      data,
      query,
      total: countResult?.total ?? 0,
    });
  },
};
