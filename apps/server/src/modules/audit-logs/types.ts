import type { z } from "@hono/zod-openapi";
import type {
  ActorType,
  AuditEventKey,
  AuditLogMetadata,
  TargetType,
} from "@repo/shared/audit";

import type { listAuditLogsQuerySchema } from "./schema";

export type {
  ActorType,
  AuditEventKey,
  AuditLogMetadata,
  FieldChange,
  TargetType,
} from "@repo/shared/audit";

export interface CreateAuditLogInput {
  actorId?: string;
  actorType?: ActorType;
  event: AuditEventKey;
  ipAddress?: string;
  metadata?: AuditLogMetadata;
  targetId?: string;
  targetType?: TargetType;
  userAgent?: string;
}

export type FindAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
