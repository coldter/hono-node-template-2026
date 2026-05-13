/**
 * Declarative middleware chain primitives. Each entry has a `name` and an
 * optional `requires` list; the boot-time well-formedness check catches
 * ordering violations at module init instead of via downstream runtime
 * errors. Generic over the app's Env so each app can specialise.
 */

import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Env as HonoEnv, MiddlewareHandler } from "hono";

export type ChainEntry<E extends HonoEnv> =
  | {
      kind: "use";
      name: string;
      mount: MiddlewareHandler<E>;
      requires?: readonly string[];
    }
  | {
      kind: "use-path";
      name: string;
      path: string;
      mount: MiddlewareHandler<E>;
      requires?: readonly string[];
    }
  | {
      kind: "get" | "post" | "all";
      name: string;
      path: string;
      handler: MiddlewareHandler<E>;
      requires?: readonly string[];
    };

export type MiddlewareChain<E extends HonoEnv> = readonly ChainEntry<E>[];

export function assertChainWellFormed<E extends HonoEnv>(
  chain: MiddlewareChain<E>
): void {
  const seen = new Set<string>();
  for (const [i, entry] of chain.entries()) {
    if (seen.has(entry.name)) {
      throw new Error(
        `middleware-chain: duplicate entry name "${entry.name}" at index ${i}`
      );
    }
    seen.add(entry.name);
    for (const req of entry.requires ?? []) {
      if (!seen.has(req)) {
        throw new Error(
          `middleware-chain: entry "${entry.name}" requires "${req}" which has not been mounted yet (index ${i})`
        );
      }
    }
  }
}

export function applyChain<E extends HonoEnv>(
  chain: MiddlewareChain<E>,
  app: OpenAPIHono<E>
): void {
  for (const entry of chain) {
    // biome-ignore lint/style/useDefaultSwitchClause: exhaustive on the closed ChainEntry["kind"] union; a default would silence the type guard
    switch (entry.kind) {
      case "use":
        app.use(entry.mount);
        break;
      case "use-path":
        app.use(entry.path, entry.mount);
        break;
      case "get":
        app.get(entry.path, entry.handler);
        break;
      case "post":
        app.post(entry.path, entry.handler);
        break;
      case "all":
        app.all(entry.path, entry.handler);
        break;
    }
  }
}
