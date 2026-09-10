import type { PushToken } from "@repo/db/schema";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import type { Executor } from "@/db";
import { notificationPushTokenService } from "@/modules/notifications/push-token-service";

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

function createExecutor(): Executor {
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

  const chains = {
    delete: () => deleteChain,
    insert: () => insertChain,
    select: () => selectChain,
    update: () => updateChain,
  };

  // SAFETY: registerPushToken reaches only select().from().where().limit(), update().set().where().returning() and insert().values().returning(); each terminal call resolves rows queued by the test.
  return new Proxy({} as Executor, {
    get: (_target, property) => chains[property as keyof typeof chains],
  });
}

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
  };
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

    const registration = notificationPushTokenService.registerPushToken(
      "usr_caller",
      "sess_new",
      { platform: "ios", token: "shared-tok" },
      createExecutor()
    );

    await expect(registration).rejects.toBeInstanceOf(HTTPException);
    await expect(registration).rejects.toThrowError(DIFFERENT_USER_MESSAGE);
    await expect(registration).rejects.toMatchObject({ status: 409 });
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
      { platform: "android", token: "same-tok" },
      createExecutor()
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
      { platform: "ios", token: "brand-new-tok" },
      createExecutor()
    );

    expect(result.id).toBe("tok_new");
    expect(result.userId).toBe("usr_caller");
    expect(result.token).toBe("brand-new-tok");
  });
});
