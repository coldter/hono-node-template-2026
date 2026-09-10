import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import type { PolicyRuleBuilder } from "../resource";
import { createAuthSchema } from "../schema";

const NO_ACTIONS_PATTERN = /has no actions/i;

describe("createAuthSchema", () => {
  it("rejects a global policy that never calls to() for untyped callers", () => {
    const auth = createAuthSchema({
      globalPolicies: (p) => {
        // SAFETY: p.deny("*") returns a PolicyRuleBuilder at runtime, which owns whereCondition; the cast exposes the pre-to() builder an untyped caller would reach.
        const stage = p.deny("*") as PolicyRuleBuilder<unknown, string>;
        return [stage.whereCondition(principalNotActive())];
      },
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    expect(() => auth.buildRegistry({})).toThrow(NO_ACTIONS_PATTERN);
  });
});
