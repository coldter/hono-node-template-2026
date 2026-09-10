import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthSchema } from "../schema";
import type { Condition, PolicyRule } from "../types";

const NO_ACTIONS_PATTERN = /has no actions/i;

describe("createAuthSchema", () => {
  it("rejects a global policy that never calls to() for untyped callers", () => {
    const auth = createAuthSchema({
      globalPolicies: (p) => {
        const stage = p.deny("*") as unknown as {
          whereCondition(condition: Condition): PolicyRule;
        };
        return [stage.whereCondition(principalNotActive())];
      },
      roles: ["admin"],
      systemAdminRoles: ["admin"],
    });

    expect(() => auth.buildRegistry({})).toThrow(NO_ACTIONS_PATTERN);
  });
});
