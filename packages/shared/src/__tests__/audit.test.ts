import { describe, expect, expectTypeOf, it } from "vitest";
import { AUDIT_EVENTS, type AuditEventKey } from "../audit";

type AuditEventObject = {
  [K in keyof typeof AUDIT_EVENTS]: (typeof AUDIT_EVENTS)[K][keyof (typeof AUDIT_EVENTS)[K]];
}[keyof typeof AUDIT_EVENTS];

type DerivedEventKey = AuditEventObject["event"];

const AUDIT_EVENT_KEYS: AuditEventKey[] = Object.values(AUDIT_EVENTS)
  .flatMap((group) => Object.values(group))
  .map((entry) => entry.event);

describe("audit", () => {
  it("flattens every event into a unique string key", () => {
    expect(AUDIT_EVENT_KEYS.length).toBeGreaterThan(0);
    expect(AUDIT_EVENT_KEYS.every((key) => typeof key === "string")).toBe(true);
    expect(new Set(AUDIT_EVENT_KEYS).size).toBe(AUDIT_EVENT_KEYS.length);
  });

  it("derives AuditEventKey from AUDIT_EVENTS", () => {
    const sample: AuditEventKey = AUDIT_EVENTS.AUTH.LOGIN_SUCCESS.event;

    expect(sample).toBe("auth.login.success");
    expect(AUDIT_EVENT_KEYS).toContain(sample);
    expectTypeOf<AuditEventKey>().toEqualTypeOf<DerivedEventKey>();
  });
});
