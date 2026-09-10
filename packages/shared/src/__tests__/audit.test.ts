import { describe, expect, it } from "vitest";
import { AUDIT_EVENTS, type AuditEventKey } from "../audit";

const AUDIT_EVENT_KEYS: AuditEventKey[] = Object.values(AUDIT_EVENTS)
  .flatMap((group) => Object.values(group))
  .map((entry) => entry.event);

describe("audit", () => {
  it("flattens every event into a unique string key", () => {
    expect(AUDIT_EVENT_KEYS.length).toBeGreaterThan(0);
    expect(new Set(AUDIT_EVENT_KEYS).size).toBe(AUDIT_EVENT_KEYS.length);
  });
});
