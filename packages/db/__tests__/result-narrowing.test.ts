import { describe, expect, it } from "vitest";
import { firstOrNull, firstOrThrow } from "../src/result-narrowing";

class DomainError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`domain:${code}`);
    this.name = "DomainError";
    this.code = code;
  }
}

describe("firstOrThrow", () => {
  it("returns the first row when the query resolves a non-empty array", async () => {
    const row = await firstOrThrow(Promise.resolve([{ id: "a" }, { id: "b" }]));
    expect(row).toEqual({ id: "a" });
  });

  it("throws an Error with the provided message when the array is empty", async () => {
    await expect(
      firstOrThrow(Promise.resolve<{ id: string }[]>([]), "missing row")
    ).rejects.toThrowError(new Error("missing row"));
  });

  it("falls back to the default message when no errorOrMessage is provided", async () => {
    await expect(
      firstOrThrow(Promise.resolve<{ id: string }[]>([]))
    ).rejects.toThrowError(new Error("Row not found"));
  });

  it("throws the factory-produced error when the array is empty", async () => {
    let caught: unknown;
    try {
      await firstOrThrow(
        Promise.resolve<{ id: string }[]>([]),
        () => new DomainError("not_found")
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect(caught).toBeInstanceOf(Error);
    const code =
      caught && typeof caught === "object" && "code" in caught
        ? (caught as { code: unknown }).code
        : undefined;
    expect(code).toBe("not_found");
  });

  it("invokes the factory lazily — only on empty arrays", async () => {
    let factoryCalls = 0;
    const factory = () => {
      factoryCalls += 1;
      return new DomainError("should_not_fire");
    };
    const row = await firstOrThrow(Promise.resolve([{ id: "only" }]), factory);
    expect(row).toEqual({ id: "only" });
    expect(factoryCalls).toBe(0);
  });
});

describe("firstOrNull", () => {
  it("returns the first row when the query resolves a non-empty array", async () => {
    const row = await firstOrNull(Promise.resolve([{ id: "x" }]));
    expect(row).toEqual({ id: "x" });
  });

  it("returns null when the array is empty", async () => {
    const row = await firstOrNull(Promise.resolve<{ id: string }[]>([]));
    expect(row).toBeNull();
  });
});
