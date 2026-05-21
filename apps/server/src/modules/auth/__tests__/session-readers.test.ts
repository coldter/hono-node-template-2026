import { describe, expect, it } from "vitest";
import {
  getSessionUserId,
  inferAuthProvider,
  readSessionUpdateActiveOrgId,
} from "../session-readers";

describe("inferAuthProvider", () => {
  it("classifies /sign-in/email as credentials", () => {
    expect(inferAuthProvider({ path: "/sign-in/email" })).toBe("credentials");
  });

  it("classifies nested credential endpoints (e.g. with sub-paths)", () => {
    expect(inferAuthProvider({ path: "/sign-in/email/verify" })).toBe(
      "credentials"
    );
  });

  it("classifies /sign-in/social as social", () => {
    expect(inferAuthProvider({ path: "/sign-in/social" })).toBe("social");
  });

  it("classifies /callback/:id as social", () => {
    expect(inferAuthProvider({ path: "/callback/google" })).toBe("social");
  });

  it("classifies /sign-in/sso as sso", () => {
    expect(inferAuthProvider({ path: "/sign-in/sso" })).toBe("sso");
  });

  it("classifies /sso/callback/:providerId as sso", () => {
    expect(inferAuthProvider({ path: "/sso/callback/okta" })).toBe("sso");
  });

  it("classifies /sso/saml2/callback/:providerId as sso", () => {
    expect(inferAuthProvider({ path: "/sso/saml2/callback/idp" })).toBe("sso");
  });

  it("returns unknown for non-auth paths", () => {
    expect(inferAuthProvider({ path: "/get-session" })).toBe("unknown");
  });

  it("returns unknown for missing path", () => {
    expect(inferAuthProvider({})).toBe("unknown");
  });

  it("returns unknown for undefined ctx", () => {
    expect(inferAuthProvider(undefined)).toBe("unknown");
  });

  it("returns unknown for non-object ctx", () => {
    expect(inferAuthProvider("nope")).toBe("unknown");
  });
});

describe("readSessionUpdateActiveOrgId", () => {
  it("returns the string when present", () => {
    expect(readSessionUpdateActiveOrgId({ activeOrganizationId: "o_1" })).toBe(
      "o_1"
    );
  });

  it("returns null when explicitly null", () => {
    expect(
      readSessionUpdateActiveOrgId({ activeOrganizationId: null })
    ).toBeNull();
  });

  it("returns undefined when the field is omitted entirely", () => {
    expect(readSessionUpdateActiveOrgId({})).toBeUndefined();
  });
});

describe("getSessionUserId", () => {
  it("pulls the id from a nested endpoint context", () => {
    const ctx = { context: { session: { user: { id: "u_1" } } } };
    expect(getSessionUserId(ctx)).toBe("u_1");
  });

  it("returns undefined when nested fields are missing", () => {
    expect(getSessionUserId({})).toBeUndefined();
    expect(getSessionUserId({ context: {} })).toBeUndefined();
    expect(getSessionUserId({ context: { session: {} } })).toBeUndefined();
  });

  it("returns undefined for non-objects", () => {
    expect(getSessionUserId(null)).toBeUndefined();
    expect(getSessionUserId(42)).toBeUndefined();
  });
});
