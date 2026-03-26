import {
  ACTOR_TYPES as SHARED_ACTOR_TYPES,
  AUDIT_EVENTS as SHARED_AUDIT_EVENTS,
  TARGET_TYPES as SHARED_TARGET_TYPES,
} from "@repo/shared/audit";
import type { AuditEventKey } from "@/modules/audit-logs/types";

export const ACTOR_TYPES = SHARED_ACTOR_TYPES;
export const ACTOR_TYPE_VALUES = Object.values(ACTOR_TYPES) as [
  (typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES],
  ...(typeof ACTOR_TYPES)[keyof typeof ACTOR_TYPES][],
];

export const TARGET_TYPES = SHARED_TARGET_TYPES;
export const TARGET_TYPE_VALUES = Object.values(TARGET_TYPES) as [
  (typeof TARGET_TYPES)[keyof typeof TARGET_TYPES],
  ...(typeof TARGET_TYPES)[keyof typeof TARGET_TYPES][],
];

export const AUDIT_EVENTS = SHARED_AUDIT_EVENTS;

export const AUDIT_EVENT_KEYS: AuditEventKey[] = Object.values(AUDIT_EVENTS)
  .flatMap((group) => Object.values(group))
  .map((e) => e.event);
