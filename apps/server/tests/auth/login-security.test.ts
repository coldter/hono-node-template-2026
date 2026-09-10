import { APIError } from "better-auth/api";
import { describe, expect, it } from "vitest";
import { isCredentialFailure } from "@/modules/auth/plugins/login-security";

function apiError(
  status: "FORBIDDEN" | "TOO_MANY_REQUESTS" | "UNAUTHORIZED",
  code?: string
) {
  return new APIError(status, { code, message: "sign-in failure" });
}

describe("login lockout failure classification", () => {
  it("counts only invalid credential failures", () => {
    expect(
      isCredentialFailure(apiError("UNAUTHORIZED", "INVALID_EMAIL_OR_PASSWORD"))
    ).toBe(true);
  });

  it("does not count other unauthorized failures", () => {
    expect(
      isCredentialFailure(apiError("UNAUTHORIZED", "FAILED_TO_CREATE_SESSION"))
    ).toBe(false);
    expect(isCredentialFailure(apiError("UNAUTHORIZED"))).toBe(false);
  });

  it("does not count failures with non-unauthorized statuses", () => {
    expect(
      isCredentialFailure(apiError("FORBIDDEN", "USER_NOT_VERIFIED"))
    ).toBe(false);
    expect(isCredentialFailure(apiError("TOO_MANY_REQUESTS"))).toBe(false);
  });

  it("does not count non-APIError return values", () => {
    expect(isCredentialFailure(undefined)).toBe(false);
    expect(isCredentialFailure(new Error("unexpected"))).toBe(false);
    expect(isCredentialFailure({ status: "UNAUTHORIZED" })).toBe(false);
  });
});
