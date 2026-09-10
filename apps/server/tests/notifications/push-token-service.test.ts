import type { PushToken } from "@repo/db/schema";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it } from "vitest";
import type { Executor } from "@/db";
import { notificationPushTokenService } from "@/modules/notifications/push-token-service";

const DIFFERENT_USER_MESSAGE = /different user/i;

const selectResults: PushToken[][] = [];
const updateResults: PushToken[][] = [];
const insertResults: PushToken[][] = [];
const updatePayloads: Record<string, unknown>[] = [];
const insertPayloads: Record<string, unknown>[] = [];

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
    set: (payload: Record<string, unknown>) => {
      updatePayloads.push(payload);
      return updateChain;
    },
    where: () => updateChain,
  };

  const insertChain = {
    returning: () => Promise.resolve(nextInsert()),
    values: (payload: Record<string, unknown>) => {
      insertPayloads.push(payload);
      return insertChain;
    },
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
  updatePayloads.length = 0;
  insertPayloads.length = 0;
});

describe("notificationPushTokenService.registerPushToken", () => {
  it("should reject another user's token, update same-user tokens, and insert new tokens", async () => {
    const executor = createExecutor();

    selectResults.push([
      makeRow({ id: "tok_conflict", token: "shared-tok", userId: "usr_other" }),
    ]);

    const conflict = await notificationPushTokenService
      .registerPushToken(
        "usr_caller",
        "sess_new",
        { platform: "ios", token: "shared-tok" },
        executor
      )
      .catch((error: unknown) => error);

    expect(conflict).toBeInstanceOf(HTTPException);
    expect(conflict).toMatchObject({
      message: expect.stringMatching(DIFFERENT_USER_MESSAGE),
      status: 409,
    });
    expect(updatePayloads).toHaveLength(0);
    expect(insertPayloads).toHaveLength(0);

    const existing = makeRow({
      id: "tok_existing",
      platform: "ios",
      sessionId: "sess_old",
      token: "same-tok",
      userId: "usr_caller",
    });
    selectResults.push([existing]);
    updateResults.push([
      makeRow({ ...existing, platform: "android", sessionId: "sess_new" }),
    ]);

    const updated = await notificationPushTokenService.registerPushToken(
      "usr_caller",
      "sess_new",
      { platform: "android", token: "same-tok" },
      executor
    );

    expect(updated).toMatchObject({
      id: "tok_existing",
      platform: "android",
      sessionId: "sess_new",
    });
    expect(updatePayloads).toHaveLength(1);
    expect(updatePayloads[0]).toMatchObject({
      isActive: true,
      lastUsedAt: expect.any(Date),
      platform: "android",
      sessionId: "sess_new",
      userId: "usr_caller",
    });
    expect(insertPayloads).toHaveLength(0);

    selectResults.push([]);
    insertResults.push([
      makeRow({
        id: "tok_new",
        platform: "ios",
        sessionId: "sess_new",
        token: "brand-new-tok",
        userId: "usr_caller",
      }),
    ]);

    const created = await notificationPushTokenService.registerPushToken(
      "usr_caller",
      "sess_new",
      { platform: "ios", token: "brand-new-tok" },
      executor
    );

    expect(created).toMatchObject({
      id: "tok_new",
      token: "brand-new-tok",
      userId: "usr_caller",
    });
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toMatchObject({
      deviceId: null,
      deviceName: null,
      isActive: true,
      platform: "ios",
      sessionId: "sess_new",
      token: "brand-new-tok",
      userId: "usr_caller",
    });
    expect(updatePayloads).toHaveLength(1);
  });
});
