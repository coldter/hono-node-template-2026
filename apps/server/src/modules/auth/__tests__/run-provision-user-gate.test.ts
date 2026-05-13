/**
 * Behavioural tests for `runProvisionUserGate` (extracted from the SSO
 * plugin's `provisionUser` callback in `instance.ts`).
 *
 * The critical invariant covered here: the auto-link gate must deny when
 * the resolved tenant is soft-deleted, even if a stale `members` row
 * survives the cascade window. Without the `liveOrganizations` join, a
 * tombstoned tenant could silently auto-link an SSO user.
 *
 * Test matrix (driven by stubbed Drizzle return values):
 *   1. happy path — live org, member row present, all signals true → resolves
 *   2. tombstoned org (live-org lookup returns []) → throws APIError("FORBIDDEN")
 *   3. live org but no member row → throws APIError("FORBIDDEN")
 *   4. emailVerified=false short-circuits → throws (no DB access required)
 *   5. domainVerified=false short-circuits → throws
 *
 * The gate uses Better Auth's `APIError("FORBIDDEN")` so the SSO plugin
 * surfaces a structured 403 rather than a 500.
 */

import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it } from "vitest";
import { runProvisionUserGate } from "../instance";
import { makeSilentLogger, silentLogger } from "./fixtures/logger";

const SILENT_LOGGER = silentLogger();

/**
 * Build a stub Drizzle client that returns the queued `select(...)`
 * results in order. The gate calls `select()` at most twice:
 *   1. liveOrganizations(db).selectById(...).where(...) → live-org rows
 *   2. db.select(...).from(...).where(...).limit(...) → member rows
 * Each call shifts a result off the queue.
 */
function makeStubDb(selectResults: unknown[][]): DrizzleClient {
  const queue = [...selectResults];
  const stub = {
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => {
          const result = queue.shift() ?? [];
          // The first call (liveOrganizations.selectById) awaits the
          // builder directly, returning a Promise<Row[]>. The second
          // call chains `.limit(1)` before awaiting.
          const promiseLike = Promise.resolve(result);
          return Object.assign(promiseLike, {
            limit: () => Promise.resolve(result),
          });
        },
      }),
    }),
  };
  return makeDrizzleStub(stub);
}

const VERIFIED_USER = { id: "u_1", emailVerified: true };
const VERIFIED_USER_INFO = { emailVerified: true };
const VERIFIED_PROVIDER = {
  providerId: "p_okta",
  organizationId: "o_1",
  domainVerified: true,
};

describe("runProvisionUserGate (A4.4 D8 gate)", () => {
  it("resolves when the org is live, the user has a membership, and all signals are true", async () => {
    const db = makeStubDb([
      [{ id: "o_1" }], // liveOrganizations.selectById → live row
      [{ id: "m_1" }], // members lookup → row found
    ]);
    const { logger, warn: logSpy } = makeSilentLogger();

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: VERIFIED_PROVIDER,
        },
        { db, logger }
      )
    ).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("throws SSO_AUTO_LINK_DENIED when the organization is tombstoned (liveOrganizations returns no row)", async () => {
    // liveOrganizations.selectById returns [] because the org's
    // deleted_at IS NOT NULL — even though a `members` row would
    // otherwise resolve. The gate must never consult `members` once the
    // org has been ruled out, so we don't bother queueing a second
    // result.
    const db = makeStubDb([
      [], // liveOrganizations.selectById → tombstoned, no live row
    ]);
    const { logger, warn: logSpy } = makeSilentLogger();

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: VERIFIED_PROVIDER,
        },
        { db, logger }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });

    // The gate logs the rejection with the three signals so an operator
    // can correlate the failure.
    expect(logSpy).toHaveBeenCalledWith(
      "SSO auto-link rejected by D8 gate",
      expect.objectContaining({
        emailVerified: true,
        domainVerified: true,
        hasMembership: false,
        organizationId: "o_1",
        providerId: "p_okta",
      })
    );
  });

  it("throws when the org is live but the user has no membership", async () => {
    const db = makeStubDb([
      [{ id: "o_1" }], // live org
      [], // members lookup → no row
    ]);

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: VERIFIED_PROVIDER,
        },
        { db, logger: SILENT_LOGGER }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });
  });

  it("throws when the IdP claim is not email_verified, even with a live org and a member row", async () => {
    // emailVerified=false alone is sufficient to deny. The gate still
    // runs the membership lookup (organizationId is set, so the cheap
    // index reads fire eagerly) before evaluating `shouldAutoLink`.
    const db = makeStubDb([[{ id: "o_1" }], [{ id: "m_1" }]]);

    await expect(
      runProvisionUserGate(
        {
          user: { id: "u_1", emailVerified: false },
          userInfo: { emailVerified: false },
          provider: VERIFIED_PROVIDER,
        },
        { db, logger: SILENT_LOGGER }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });
  });

  it("throws when domainVerified is false", async () => {
    const db = makeStubDb([
      [{ id: "o_1" }], // live org
      [{ id: "m_1" }], // member row exists
    ]);

    await expect(
      runProvisionUserGate(
        {
          user: VERIFIED_USER,
          userInfo: VERIFIED_USER_INFO,
          provider: {
            providerId: "p_okta",
            organizationId: "o_1",
            domainVerified: false,
          },
        },
        { db, logger: SILENT_LOGGER }
      )
    ).rejects.toMatchObject({
      status: "FORBIDDEN",
      body: { message: "SSO auto-link denied for this organization" },
    });
  });
});
