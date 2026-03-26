/**
 * Tests for the CASL-based permission system.
 *
 * These tests verify that permission strings correctly map to CASL actions.
 * Ownership filtering is handled by services, not CASL rules.
 */

import { subject } from "@casl/ability";
import { defineAbilityFor } from "@repo/shared/abilities";
import { describe, expect, it } from "vitest";

// ============================================================
// TEST DATA
// ============================================================

const USER_ID = "user_1";

const user = {
  id: USER_ID,
  name: "Test User",
  email: "test@example.com",
  status: "active",
};

// ============================================================
// USER ABILITY TESTS
// ============================================================

describe("User Abilities", () => {
  it("users can always read their own profile", () => {
    const ability = defineAbilityFor({
      userId: USER_ID,
      permissions: [],
    });

    expect(ability.can("read", subject("User", user))).toBe(true);
  });

  it("users can update their own profile", () => {
    const ability = defineAbilityFor({
      userId: USER_ID,
      permissions: [],
    });

    expect(ability.can("update", subject("User", user))).toBe(true);
  });

  it("users:view grants read permission", () => {
    const ability = defineAbilityFor({
      userId: USER_ID,
      permissions: ["users:view"],
    });

    expect(ability.can("read", "User")).toBe(true);
  });

  it("users:create grants create permission", () => {
    const ability = defineAbilityFor({
      userId: USER_ID,
      permissions: ["users:create"],
    });

    expect(ability.can("create", "User")).toBe(true);
  });
});

// ============================================================
// WILDCARD PERMISSION TESTS
// ============================================================

describe("Wildcard (*) Permission", () => {
  it("grants all actions on all subjects", () => {
    const ability = defineAbilityFor({
      userId: USER_ID,
      permissions: ["*"],
    });

    expect(ability.can("read", "User")).toBe(true);
    expect(ability.can("create", "User")).toBe(true);
    expect(ability.can("update", "User")).toBe(true);
    expect(ability.can("delete", "User")).toBe(true);
  });
});

// ============================================================
// NO PERMISSIONS TESTS
// ============================================================

describe("No Permissions", () => {
  it("user with no permissions cannot access other users", () => {
    const ability = defineAbilityFor({
      userId: USER_ID,
      permissions: [],
    });

    expect(ability.can("read", "User")).toBe(false);
    expect(ability.can("create", "User")).toBe(false);
    expect(ability.can("delete", "User")).toBe(false);
  });

  it("user can still access their own profile", () => {
    const ability = defineAbilityFor({
      userId: USER_ID,
      permissions: [],
    });

    expect(ability.can("read", subject("User", user))).toBe(true);
    expect(ability.can("update", subject("User", user))).toBe(true);
  });
});
