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
    event: z
      .string()
      .optional()
      .openapi({ description: "Filter by event (supports wildcard: auth.*)" }),
    actorId: z
      .string()
      .optional()
      .openapi({ description: "Filter by actor ID" }),
    targetId: z
      .string()
      .optional()
      .openapi({ description: "Filter by target ID" }),
    targetType: z
      .enum(TARGET_TYPE_VALUES)
      .optional()
      .openapi({ description: "Filter by target type" }),
    startDate: z.iso
      .datetime()
      .optional()
      .openapi({ description: "Start date (ISO 8601)" }),
    endDate: z.iso
      .datetime()
      .optional()
      .openapi({ description: "End date (ISO 8601)" }),
  })
  .extend(paginationQuerySchema.shape);

export const auditLogSchema = z.object({
  id: z.string(),
  event: z.enum(AUDIT_EVENT_KEYS),
  actorId: z.string().nullable(),
  actorType: z.enum(ACTOR_TYPE_VALUES),
  targetId: z.string().nullable(),
  targetType: z.enum(TARGET_TYPE_VALUES).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  createdAt: z.string().datetime(),
});

export const listAuditLogsResponseSchema = createPaginatedResponseSchema(
  auditLogSchema,
  "Paginated audit logs"
);
