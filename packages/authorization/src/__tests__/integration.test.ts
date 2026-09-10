import { describe, expect, it } from "vitest";
import { createAuthSchema, principalNotActive } from "../index";
import type { Principal } from "../types";

describe("integration: multi-tenant", () => {
  const auth = createAuthSchema({
    globalPolicies: (p) => [
      p.deny("*").to("*").whereCondition(principalNotActive()),
    ],
    organizationRoles: ["owner", "admin", "member"],
    roles: ["admin", "member"],
    systemAdminRoles: ["admin"],
  });

  interface ProjectResource {
    createdBy: string;
    id: string;
    organizationId: string;
  }

  const projectResource = auth.createResource<ProjectResource>()("project", {
    actions: ["list", "view", "create", "update", "delete"],
    policies: (p) => [
      p.allow("admin").to("*"),
      p.allow("member").to("list", "view").withOrgRole("member"),
      p.allow("member").to("*").withOrgRole("owner", "admin"),
      p.allow("member").to("update").whereOwner(),
    ],
    resolveOrganization: (r) => r.organizationId,
    resolveOwner: (r) => r.createdBy,
  });

  const registry = auth.buildRegistry({ project: projectResource });

  const orgMember: Principal = {
    attributes: { status: "active" },
    id: "usr_org_member",
    organization: { id: "org_1", role: "member" },
    roles: ["member"],
  };

  const orgOwner: Principal = {
    attributes: { status: "active" },
    id: "usr_org_owner",
    organization: { id: "org_1", role: "owner" },
    roles: ["member"],
  };

  const sysAdmin: Principal = {
    attributes: { status: "active" },
    id: "usr_sys_admin",
    roles: ["admin"],
  };

  const noOrgUser: Principal = {
    attributes: { status: "active" },
    id: "usr_no_org",
    roles: ["member"],
  };

  const project1: ProjectResource = {
    createdBy: "usr_org_member",
    id: "proj_1",
    organizationId: "org_1",
  };

  const projectOtherOrg: ProjectResource = {
    createdBy: "usr_other",
    id: "proj_2",
    organizationId: "org_2",
  };

  it("org owner in matching org can delete project", async () => {
    const decision = await registry.can(orgOwner, "project", "delete", {
      resource: project1,
    });
    expect(decision.allowed).toBe(true);
  });

  it("org member in wrong org is denied", async () => {
    const decision = await registry.can(orgMember, "project", "list", {
      resource: projectOtherOrg,
    });
    expect(decision.allowed).toBe(false);
  });

  it("user with no org context is denied for org-scoped resource", async () => {
    const decision = await registry.can(noOrgUser, "project", "list", {
      resource: project1,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("ORG_CONTEXT_MISSING");
    }
  });

  it("system admin bypasses org check for cross-org resource", async () => {
    const decision = await registry.can(sysAdmin, "project", "delete", {
      resource: projectOtherOrg,
    });
    expect(decision.allowed).toBe(true);
  });
});
