import { describe, expect, it } from "vitest";
import { principalNotActive } from "../conditions";
import { createAuthSchema, principalAttribute } from "../schema";

describe("createAuthSchema", () => {
  it("runs the globalPolicies builder callback and exposes the result", () => {
    const auth = createAuthSchema({
      roles: ["admin"],
      systemAdminRoles: ["admin"],
      relations: [],
      principal: { status: principalAttribute<string>() },
      globalPolicies: (p) => [p.deny("*").to("*").where(principalNotActive())],
    });

    expect(auth.globalPolicies).toHaveLength(1);
    expect(auth.globalPolicies[0]?.effect).toBe("deny");
  });
});
