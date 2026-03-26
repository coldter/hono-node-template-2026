import type { z } from "@hono/zod-openapi";
import type { ValueOf } from "type-fest";

import type { ACTOR_TYPES, AUDIT_EVENTS, TARGET_TYPES } from "./constants";
import type { listAuditLogsQuerySchema } from "./schema";

export type ActorType = (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES];
export type TargetType = (typeof TARGET_TYPES)[keyof typeof TARGET_TYPES];

export type AuditEventObject = ValueOf<{
  [K in keyof typeof AUDIT_EVENTS]: ValueOf<(typeof AUDIT_EVENTS)[K]>;
}>;

export type AuditEventKey = AuditEventObject["event"];

export interface FieldChange<T = unknown> {
  from: T;
  to: T;
}

export interface AuditLogMetadata {
  changedFields?: string[];
  changes?: Record<string, FieldChange>;
  [key: string]: unknown;
}

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
