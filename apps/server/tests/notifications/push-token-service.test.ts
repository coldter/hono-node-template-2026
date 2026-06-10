import type { PushToken } from "@repo/db/schema";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DIFFERENT_USER_MESSAGE = /different user/i;

const selectResults: PushToken[][] = [];
const updateResults: PushToken[][] = [];
const insertResults: PushToken[][] = [];

function nextSelect(): PushToken[] {
  const next = selectResults.shift();
  if (!next) {
    throw new Error("selectResults exhausted: test queued too few selects");
  }
  return next;
}

function nextUpdate(): PushToken[] {
  const next = updateResults.shift();
  if (!next) {
    throw new Error("updateResults exhausted: test queued too few updates");
  }
  return next;
}

function nextInsert(): PushToken[] {
  const next = insertResults.shift();
  if (!next) {
    throw new Error("insertResults exhausted: test queued too few inserts");
  }
  return next;
}

vi.mock("@/db", () => {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => selectChain,
    limit: () => Promise.resolve(nextSelect()),
  };

  const updateChain = {
    set: () => updateChain,
    where: () => updateChain,
    returning: () => Promise.resolve(nextUpdate()),
  };

  const insertChain = {
    values: () => insertChain,
    returning: () => Promise.resolve(nextInsert()),
  };

  const deleteChain = {
    where: () => deleteChain,
    returning: () => Promise.resolve([]),
  };

  return {
    db: {
      select: () => selectChain,
      update: () => updateChain,
      insert: () => insertChain,
      delete: () => deleteChain,
    },
  };
});

const { notificationPushTokenService } = await import(
  "@/modules/notifications/push-token-service"
);

function makeRow(overrides: Partial<PushToken>): PushToken {
  return {
    id: "tok_row",
    userId: "usr_owner",
    sessionId: "sess_1",
    token: "fcm-token-1",
    platform: "ios",
    deviceId: null,
    deviceName: null,
    isActive: true,
    lastUsedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
    // boundary: PushToken schema fields vary across drizzle versions; the test
    // only relies on userId/sessionId/platform/token being present.
  } as PushToken;
}

beforeEach(() => {
  selectResults.length = 0;
  updateResults.length = 0;
  insertResults.length = 0;
});

describe("notificationPushTokenService.registerPushToken", () => {
  it("should throw HTTPException(409) when token already belongs to a different user", async () => {
    selectResults.push([
      makeRow({ id: "tok_conflict", userId: "usr_other", token: "shared-tok" }),
    ]);

    let caught: unknown;
    try {
      await notificationPushTokenService.registerPushToken(
        "usr_caller",
        "sess_new",
        { token: "shared-tok", platform: "ios" }
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(HTTPException);
    if (caught instanceof HTTPException) {
      expect(caught.status).toBe(409);
      expect(caught.message).toMatch(DIFFERENT_USER_MESSAGE);
    }
  });

  it("should update sessionId/platform without error when token already belongs to the same user", async () => {
    const existing = makeRow({
      id: "tok_existing",
      userId: "usr_caller",
      sessionId: "sess_old",
      platform: "ios",
      token: "same-tok",
    });
    const updated = makeRow({
      ...existing,
      sessionId: "sess_new",
      platform: "android",
    });

    selectResults.push([existing]);
    updateResults.push([updated]);

    const result = await notificationPushTokenService.registerPushToken(
      "usr_caller",
      "sess_new",
      { token: "same-tok", platform: "android" }
    );

    expect(result.id).toBe("tok_existing");
    expect(result.sessionId).toBe("sess_new");
    expect(result.platform).toBe("android");
  });

  it("should create a new row when the token is brand new", async () => {
    selectResults.push([]);
    const created = makeRow({
      id: "tok_new",
      userId: "usr_caller",
      sessionId: "sess_new",
      token: "brand-new-tok",
      platform: "ios",
    });
    insertResults.push([created]);

    const result = await notificationPushTokenService.registerPushToken(
      "usr_caller",
      "sess_new",
      { token: "brand-new-tok", platform: "ios" }
    );

    expect(result.id).toBe("tok_new");
    expect(result.userId).toBe("usr_caller");
    expect(result.token).toBe("brand-new-tok");
  });
});
