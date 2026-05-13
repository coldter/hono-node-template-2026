import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { createAuthBase } from "../instance-base";
import { silentLogger } from "./fixtures/logger";

function makeDeps() {
  return {
    db,
    appName: "TestApp",
    secret: "test-secret-value",
    logger: silentLogger(),
  };
}

describe("createAuthBase", () => {
  it("default idGenerator returns false for unknown BA models so BA falls back to its own generator", () => {
    const base = createAuthBase(makeDeps());
    const gen = base.advanced?.database?.generateId;
    if (typeof gen !== "function") {
      throw new Error("generateId is not a function");
    }
    expect(gen({ model: "totally-unknown-model" })).toBe(false);
  });
});
