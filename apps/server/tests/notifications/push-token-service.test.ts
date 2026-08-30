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
    limit: () => Promise.resolve(nextSelect()),
    orderBy: () => selectChain,
    where: () => selectChain,
  };

  const updateChain = {
    returning: () => Promise.resolve(nextUpdate()),
    set: () => updateChain,
    where: () => updateChain,
  };

  const insertChain = {
    returning: () => Promise.resolve(nextInsert()),
    values: () => insertChain,
  };

  const deleteChain = {
    returning: () => Promise.resolve([]),
    where: () => deleteChain,
  };

  return {
    db: {
      delete: () => deleteChain,
      insert: () => insertChain,
      select: () => selectChain,
      update: () => updateChain,
    },
  };
});

const { notificationPushTokenService } = await import(
  "@/modules/notifications/push-token-service"
);

function makeRow(overrides: Partial<PushToken>): PushToken {
  return {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    deviceId: null,
    deviceName: null,
    id: "tok_row",
    isActive: true,
    lastUsedAt: null,
    platform: "ios",
    sessionId: "sess_1",
    token: "fcm-token-1",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    userId: "usr_owner",
    ...overrides,
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
      makeRow({ id: "tok_conflict", token: "shared-tok", userId: "usr_other" }),
    ]);

    let caught: unknown;
    try {
      await notificationPushTokenService.registerPushToken(
        "usr_caller",
        "sess_new",
        { platform: "ios", token: "shared-tok" }
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
      platform: "ios",
      sessionId: "sess_old",
      token: "same-tok",
      userId: "usr_caller",
    });
    const updated = makeRow({
      ...existing,
      platform: "android",
      sessionId: "sess_new",
    });

    selectResults.push([existing]);
    updateResults.push([updated]);

    const result = await notificationPushTokenService.registerPushToken(
      "usr_caller",
      "sess_new",
      { platform: "android", token: "same-tok" }
    );

    expect(result.id).toBe("tok_existing");
    expect(result.sessionId).toBe("sess_new");
    expect(result.platform).toBe("android");
  });

  it("should create a new row when the token is brand new", async () => {
    selectResults.push([]);
    const created = makeRow({
      id: "tok_new",
      platform: "ios",
      sessionId: "sess_new",
      token: "brand-new-tok",
      userId: "usr_caller",
    });
    insertResults.push([created]);

    const result = await notificationPushTokenService.registerPushToken(
      "usr_caller",
      "sess_new",
      { platform: "ios", token: "brand-new-tok" }
    );

    expect(result.id).toBe("tok_new");
    expect(result.userId).toBe("usr_caller");
    expect(result.token).toBe("brand-new-tok");
  });
});
