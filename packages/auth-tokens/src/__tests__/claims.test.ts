import type { Tenant } from "@repo/tenancy";
import { describe, expect, it } from "vitest";
import { buildClaims, TenantJwtClaimsSchema } from "../claims";

const JTI_RE = /^[0-9a-f]{24}$/;

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    organizationId: "o_1",
    slug: "acme",
    host: "acme.app.example.com",
    kind: "subdomain",
    enforceSSO: false,
    sessionVersion: 3,
    suspendedAt: null,
    deletedAt: null,
    branding: { logoVersion: 0, primaryColor: "#2563eb", appName: "App" },
    ...overrides,
  };
}

describe("buildClaims", () => {
  it("returns {} when tenant is null", () => {
    expect(buildClaims({ user: { id: "u_1" } }, null)).toEqual({});
  });

  it("emits URL-form aud/iss, org claim, and jti for a resolved tenant", () => {
    const tenant = makeTenant();
    const payload = buildClaims({ user: { id: "u_1" } }, tenant);

    expect(payload).toMatchObject({
      sub: "u_1",
      aud: "https://acme.app.example.com",
      iss: "https://acme.app.example.com",
      org: {
        id: "o_1",
        slug: "acme",
        host: "acme.app.example.com",
        sessionVersion: 3,
      },
    });
    expect(payload.jti).toMatch(JTI_RE);
  });

  it("omits sub when the ctx has no user id", () => {
    const payload = buildClaims({}, makeTenant());
    expect("sub" in payload).toBe(false);
  });

  it("omits sub when the ctx user id is non-string", () => {
    const payload = buildClaims({ user: { id: 42 } }, makeTenant());
    expect("sub" in payload).toBe(false);
  });

  it.each([
    0, 7, 999_999_999,
  ])("carries sessionVersion=%i through to the org claim", (sessionVersion) => {
    const payload = buildClaims(
      { user: { id: "u_1" } },
      makeTenant({ sessionVersion })
    );
    const org = (payload as { org: { sessionVersion: number } }).org;
    expect(org.sessionVersion).toBe(sessionVersion);
  });

  it("preserves slug=null in the org claim (custom-domain tenants)", () => {
    const payload = buildClaims(
      { user: { id: "u_1" } },
      makeTenant({ slug: null, kind: "custom" })
    );
    const org = (payload as { org: { slug: string | null } }).org;
    expect(org.slug).toBeNull();
  });

  it("produces a unique jti across 100 calls", () => {
    const tenant = makeTenant();
    const jtis = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const payload = buildClaims({ user: { id: "u_1" } }, tenant);
      const jti = (payload as { jti: string }).jti;
      expect(jti).toMatch(JTI_RE);
      jtis.add(jti);
    }
    expect(jtis.size).toBe(100);
  });

  it("round-trips through TenantJwtClaimsSchema.parse for a resolved tenant", () => {
    const payload = buildClaims({ user: { id: "u_1" } }, makeTenant());
    expect(() => TenantJwtClaimsSchema.parse(payload)).not.toThrow();
  });

  it("round-trips through TenantJwtClaimsSchema.parse for the empty case", () => {
    expect(() => TenantJwtClaimsSchema.parse({})).not.toThrow();
  });

  it("rejects unknown top-level claims via .strict()", () => {
    const payload = buildClaims({ user: { id: "u_1" } }, makeTenant());
    const polluted = { ...payload, evil: "yes" };
    expect(() => TenantJwtClaimsSchema.parse(polluted)).toThrow();
  });
});
