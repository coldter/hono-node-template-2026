import { describe, expect, it } from "vitest";
import {
  createOrgRoleCondition,
  createOwnerCondition,
  createSelfTargetCondition,
  principalNotActive,
} from "../conditions";
import type { Principal } from "../types";

const ORG_ROLE_REQUIRED_PATTERN = /at least one org role/;

const principal: Principal = {
  attributes: {},
  id: "u1",
  roles: ["user"],
};

describe("conditions", () => {
  it("evaluates principal, owner, self-target, and org-role conditions", () => {
    const notActive = principalNotActive();
    expect(
      notActive.evaluate({
        principal: { ...principal, attributes: { status: "inactive" } },
      })
    ).toBe(true);
    expect(notActive.evaluate({ principal })).toBe(true);
    expect(
      notActive.evaluate({
        principal: { ...principal, attributes: { status: "active" } },
      })
    ).toBe(false);

    const owner = createOwnerCondition<{ createdBy: string }>(
      (resource) => resource.createdBy
    );
    expect(owner.evaluate({ principal, resource: { createdBy: "u1" } })).toBe(
      true
    );
    expect(owner.evaluate({ principal, resource: { createdBy: "u2" } })).toBe(
      false
    );
    expect(owner.evaluate({ principal })).toBe(false);

    const selfTarget = createSelfTargetCondition<{ id: string }>();
    expect(selfTarget.evaluate({ principal, resource: { id: "u1" } })).toBe(
      true
    );
    expect(selfTarget.evaluate({ principal, resource: { id: "u2" } })).toBe(
      false
    );
    expect(selfTarget.evaluate({ principal })).toBe(false);

    const orgRole = createOrgRoleCondition<{ id: string }>(["owner"]);
    expect(
      orgRole.evaluate({
        principal: {
          ...principal,
          organization: { id: "org_1", role: "owner" },
        },
      })
    ).toBe(true);
    expect(
      orgRole.evaluate({
        principal: {
          ...principal,
          organization: { id: "org_1", role: "member" },
        },
      })
    ).toBe(false);
    expect(orgRole.evaluate({ principal })).toBe(false);

    expect(() => createOrgRoleCondition([])).toThrow(ORG_ROLE_REQUIRED_PATTERN);
  });
});
