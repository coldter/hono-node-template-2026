import type { Env, MiddlewareHandler } from "hono";
import { describe, expect, it } from "vitest";
import { assertChainWellFormed, type ChainEntry } from "../chain";

const noop: MiddlewareHandler<Env> = async (_c, next) => {
  await next();
};

const REQUIRES_LATER_RE = /requires "later"/;
const DUPLICATE_NAME_RE = /duplicate entry name/;

describe("assertChainWellFormed", () => {
  it("throws when an entry requires a name that has not been mounted yet", () => {
    const bad: ChainEntry<Env>[] = [
      {
        kind: "use",
        name: "needsLater",
        mount: noop,
        requires: ["later"],
      },
      { kind: "use", name: "later", mount: noop },
    ];
    expect(() => assertChainWellFormed(bad)).toThrow(REQUIRES_LATER_RE);
  });

  it("throws on duplicate entry names", () => {
    const bad: ChainEntry<Env>[] = [
      { kind: "use", name: "dup", mount: noop },
      { kind: "use", name: "dup", mount: noop },
    ];
    expect(() => assertChainWellFormed(bad)).toThrow(DUPLICATE_NAME_RE);
  });

  it("accepts a well-formed list", () => {
    const good: ChainEntry<Env>[] = [
      { kind: "use", name: "a", mount: noop },
      { kind: "use", name: "b", mount: noop, requires: ["a"] },
      { kind: "use", name: "c", mount: noop, requires: ["a", "b"] },
    ];
    expect(() => assertChainWellFormed(good)).not.toThrow();
  });
});
