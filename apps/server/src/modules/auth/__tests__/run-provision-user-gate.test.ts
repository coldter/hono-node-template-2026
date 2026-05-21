// Critical invariant: the gate must deny when the resolved tenant is
// soft-deleted, even if a stale `members` row survives the cascade window.

import type { DrizzleClient } from "@repo/db";
import { makeDrizzleStub } from "@repo/test-harness";
import { describe, expect, it } from "vitest";
import { runProvisionUserGate } from "../instance";
import { makeSilentLogger, silentLogger } from "./fixtures/logger";

const SILENT_LOGGER = silentLogger();

function makeStubDb(selectResults: unknown[][]): DrizzleClient {
  const queue = [...selectResults];
  const stub = {
    select: () => ({
      from: () => ({
        where: (..._args: unknown[]) => {
          const result = queue.shift() ?? [];
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
    const db = makeStubDb([[{ id: "o_1" }], [{ id: "m_1" }]]);
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
    const db = makeStubDb([[]]);
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
    const db = makeStubDb([[{ id: "o_1" }], []]);

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
    const db = makeStubDb([[{ id: "o_1" }], [{ id: "m_1" }]]);

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
