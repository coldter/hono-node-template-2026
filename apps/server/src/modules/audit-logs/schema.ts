import { z } from "@hono/zod-openapi";

import {
  createPaginatedResponseSchema,
  paginationQuerySchema,
} from "@/utils/pagination";

import {
  ACTOR_TYPE_VALUES,
  AUDIT_EVENT_KEYS,
  TARGET_TYPE_VALUES,
} from "./constants";

export const listAuditLogsQuerySchema = z
  .object({
    actorId: z
      .string()
      .optional()
      .openapi({ description: "Filter by actor ID" }),
    endDate: z.iso
      .datetime()
      .optional()
      .openapi({ description: "End date (ISO 8601)" }),
    event: z
      .string()
      .optional()
      .openapi({ description: "Filter by event (supports wildcard: auth.*)" }),
    startDate: z.iso
      .datetime()
      .optional()
      .openapi({ description: "Start date (ISO 8601)" }),
    targetId: z
      .string()
      .optional()
      .openapi({ description: "Filter by target ID" }),
    targetType: z
      .enum(TARGET_TYPE_VALUES)
      .optional()
      .openapi({ description: "Filter by target type" }),
  })
  .extend(paginationQuerySchema.shape);

export const auditEventKeySchema = z.enum(AUDIT_EVENT_KEYS);

export const auditLogSchema = z.object({
  actorId: z.string().nullable(),
  actorType: z.enum(ACTOR_TYPE_VALUES),
  createdAt: z.string().datetime(),
  event: auditEventKeySchema,
  id: z.string(),
  ipAddress: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  targetId: z.string().nullable(),
  targetType: z.enum(TARGET_TYPE_VALUES).nullable(),
  userAgent: z.string().nullable(),
});

export const listAuditLogsResponseSchema = createPaginatedResponseSchema(
  auditLogSchema,
  "Paginated audit logs"
);
