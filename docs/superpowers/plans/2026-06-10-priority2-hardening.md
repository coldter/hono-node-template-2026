# Priority 2 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two documented security bugs, add env-gated Redis rate limiting, resolve dead code, run tests against Postgres in CI, deepen CI minimally, add Changesets release automation, and ship an env-flagged sign-up flow.

**Architecture:** All server changes live in `apps/server` (env schema, middlewares, auth instance, lib). Redis is one lazy node-redis client shared by Better Auth's rate-limit `customStorage` and the global limiter's `rate-limit-redis` store, fully gated on optional `REDIS_URL`. Web changes add an env-gated `/signup` route reusing existing auth-module patterns. CI keeps one fast `validate` job plus a new `release.yml`.

**Tech Stack:** Bun, Hono 4.12 (`hono-rate-limiter`, `@hono/node-server`), Better Auth 1.6.14, node-redis v5, `rate-limit-redis`, Drizzle, Vitest, Changesets, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-10-priority2-hardening-design.md`

**Conventions that apply to every task:**
- Run `bun run fix` from repo root before addressing lint/type errors.
- No emojis. Comments only for WHY. No `any`, no non-null `!`.
- Run server tests from repo root with `bun run test` or scoped: `cd apps/server && bun run test -- tests/<file>`.
- Commit after every task (small commits, message style: imperative, no conventional-commit prefix — match `git log` style like "Add ClientMeta and deleted status to generated API").

---

### Task 1: Env additions (`TRUST_PROXY`, `REDIS_URL`, `ENABLE_SIGNUP`)

**Files:**
- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/.env.example`

- [ ] **Step 1: Add the three vars to the Zod schema**

In `apps/server/src/env.ts`, inside the `z.object({...})`, after the `CORS_ORIGIN` entry add:

```ts
    TRUST_PROXY: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
    REDIS_URL: z.string().optional(),
    ENABLE_SIGNUP: z
      .string()
      .default("false")
      .transform((val) => val === "true" || val === "1"),
```

- [ ] **Step 2: Document in `.env.example`**

Append to `apps/server/.env.example`:

```bash
# Set to true when deployed behind a trusted reverse proxy (Caddy).
# Rate limiting then keys on the rightmost X-Forwarded-For entry.
TRUST_PROXY=false

# Optional. When set, Better Auth and the global rate limiter store counters
# in Redis (required for multi-instance deployments).
# REDIS_URL=redis://localhost:6379

# Self-serve sign-up. Default false (invite-only).
ENABLE_SIGNUP=true
```

- [ ] **Step 3: Verify**

Run: `bun run check-types` — expect PASS (vars are additive, nothing consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/env.ts apps/server/.env.example
git commit -m "Add TRUST_PROXY, REDIS_URL, ENABLE_SIGNUP env vars"
```

---

### Task 2: Client IP helper (rate-limit keying, security bug 4)

**Files:**
- Create: `apps/server/src/lib/client-ip.ts`
- Test: `apps/server/tests/server/client-ip.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/server/client-ip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveRateLimitKey } from "@/lib/client-ip";

describe("resolveRateLimitKey", () => {
  it("should use the rightmost x-forwarded-for entry when trustProxy is true", () => {
    const key = resolveRateLimitKey({
      forwardedFor: "1.1.1.1, 2.2.2.2, 3.3.3.3",
      remoteAddress: "9.9.9.9",
      trustProxy: true,
    });
    expect(key).toBe("3.3.3.3");
  });

  it("should ignore x-forwarded-for entirely when trustProxy is false", () => {
    const key = resolveRateLimitKey({
      forwardedFor: "1.1.1.1",
      remoteAddress: "9.9.9.9",
      trustProxy: false,
    });
    expect(key).toBe("9.9.9.9");
  });

  it("should fall back to remote address when trustProxy is true but header is absent", () => {
    const key = resolveRateLimitKey({
      forwardedFor: undefined,
      remoteAddress: "9.9.9.9",
      trustProxy: true,
    });
    expect(key).toBe("9.9.9.9");
  });

  it("should return null when no IP is resolvable", () => {
    const key = resolveRateLimitKey({
      forwardedFor: undefined,
      remoteAddress: undefined,
      trustProxy: false,
    });
    expect(key).toBeNull();
  });

  it("should never return an empty string for a whitespace-only header", () => {
    const key = resolveRateLimitKey({
      forwardedFor: " , ",
      remoteAddress: undefined,
      trustProxy: true,
    });
    expect(key).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bunx vitest run tests/server/client-ip.test.ts`
Expected: FAIL — cannot resolve `@/lib/client-ip`.

- [ ] **Step 3: Implement the helper**

Create `apps/server/src/lib/client-ip.ts`:

```ts
type RateLimitKeyInput = {
  forwardedFor: string | undefined;
  remoteAddress: string | undefined;
  trustProxy: boolean;
};

// Rightmost X-Forwarded-For entry is the one appended by our own proxy;
// leftmost entries are client-supplied and attacker-rotatable.
export function resolveRateLimitKey(input: RateLimitKeyInput): string | null {
  if (input.trustProxy && input.forwardedFor) {
    const parts = input.forwardedFor
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    const rightmost = parts.at(-1);
    if (rightmost) {
      return rightmost;
    }
  }

  return input.remoteAddress && input.remoteAddress.length > 0
    ? input.remoteAddress
    : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bunx vitest run tests/server/client-ip.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/client-ip.ts apps/server/tests/server/client-ip.test.ts
git commit -m "Add trusted-proxy-aware rate limit key resolver"
```

---

### Task 3: Wire the key resolver into the global limiter (fail closed)

**Files:**
- Modify: `apps/server/src/middlewares/rate-limit.ts`
- Modify: `docs/security.md` (item 4)

- [ ] **Step 1: Rewrite the middleware**

Replace the contents of `apps/server/src/middlewares/rate-limit.ts` with:

```ts
import { getConnInfo } from "@hono/node-server/conninfo";
import { HTTPException } from "hono/http-exception";
import { rateLimiter } from "hono-rate-limiter";
import { ms } from "itty-time";
import { env } from "@/env";
import { resolveRateLimitKey } from "@/lib/client-ip";
import type { Env } from "@/lib/context";

const tooManyRequests = () => {
  throw new HTTPException(429, {
    message: "Too many requests, please try again later.",
  });
};

export const globalRateLimitMW = rateLimiter<Env>({
  windowMs: ms("1 minutes"),
  limit: 1000,
  keyGenerator: (c) => {
    let remoteAddress: string | undefined;
    try {
      remoteAddress = getConnInfo(c).remote.address ?? undefined;
    } catch {
      // getConnInfo throws outside the node-server runtime (tests, workers).
      remoteAddress = undefined;
    }

    const key = resolveRateLimitKey({
      forwardedFor: c.req.header("x-forwarded-for"),
      remoteAddress,
      trustProxy: env.TRUST_PROXY,
    });

    // Fail closed: a request with no resolvable client IP must not land in a
    // shared anonymous bucket.
    if (!key) {
      tooManyRequests();
    }
    return key as string;
  },
  handler: tooManyRequests,
});
```

Note: `keyGenerator` must return `string`; `tooManyRequests()` throws so the cast after it never executes a `null`. If lint rejects the cast, restructure with `if (key) return key; throw new HTTPException(429, ...)`.

- [ ] **Step 2: Verify types and existing tests**

Run: `bun run check-types && cd apps/server && bunx vitest run`
Expected: PASS — existing tests mock this middleware, so nothing else changes.

- [ ] **Step 3: Update `docs/security.md` item 4**

Replace section "## 4. Shared-bucket IP keying" body with:

```markdown
**Status: FIXED (2026-06).** The limiter keys on `resolveRateLimitKey()`
(`apps/server/src/lib/client-ip.ts`): with `TRUST_PROXY=true` it uses the
rightmost `X-Forwarded-For` entry (appended by our own proxy — leftmost values
are attacker-rotatable and are never trusted); otherwise it uses the socket
address from `getConnInfo()`. Requests with no resolvable IP are rejected with
429 (fail closed) instead of sharing an anonymous bucket. Set `TRUST_PROXY=true`
only when the app is deployed behind a trusted reverse proxy (the shipped Caddy
config qualifies).
```

Also update its row in the summary table to `Fixed — keyed via TRUST_PROXY-aware resolver, fail closed.`

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/middlewares/rate-limit.ts docs/security.md
git commit -m "Fail closed on unresolvable client IP in global rate limiter"
```

---

### Task 4: Remove the User-Agent trust bypass (security bug 2)

**Files:**
- Modify: `apps/server/src/modules/auth/instance.ts:127-148, 246-248`
- Modify: `docs/security.md` (item 2)

- [ ] **Step 1: Delete the bypass**

In `apps/server/src/modules/auth/instance.ts`:

1. Delete the whole `resolveTrustedOrigins` function (lines 127–148).
2. Replace the `trustedOrigins` option (and the comment above it):

```ts
  // Mobile clients must send an explicit Origin header included in CORS_ORIGIN.
  // detectPlatform() is used for session lifetimes only and never for trust.
  trustedOrigins: env.CORS_ORIGIN,
```

`detectPlatform`, `MOBILE_PATTERNS`, and all session-lifetime logic stay untouched.

- [ ] **Step 2: Verify**

Run: `bun run check-types && cd apps/server && bunx vitest run`
Expected: PASS. Also confirm no other reference: `grep -rn "resolveTrustedOrigins" apps/server/src` returns nothing.

No new test: the option is now a static allowlist evaluated inside Better Auth; a test would only restate configuration (behavioral-test minimalism). The deletion itself is the fix.

- [ ] **Step 3: Update `docs/security.md` item 2**

Replace section "## 2. User-Agent-based mobile trust bypass" body with:

```markdown
**Status: FIXED (2026-06).** The UA-sniffing branch was removed; `trustedOrigins`
is now exactly `CORS_ORIGIN`. Mobile clients (Expo / React Native) must send an
explicit `Origin` header (e.g. `https://my-app.mobile`) and that origin must be
added to `CORS_ORIGIN`. User-Agent now influences only session lifetimes
(web 1h / mobile 7d), never trust.
```

Update its summary-table row to `Fixed — UA branch removed; explicit Origin required.`

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/modules/auth/instance.ts docs/security.md
git commit -m "Remove User-Agent based trusted origin bypass"
```

---

### Task 5: Redis client lib with eager boot validation

**Files:**
- Create: `apps/server/src/lib/redis.ts`
- Modify: `apps/server/src/index.ts`

- [ ] **Step 1: Create the client module**

Create `apps/server/src/lib/redis.ts`:

```ts
import { createClient } from "redis";
import { env } from "@/env";
import { logger } from "@/lib/logger";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;

export function isRedisEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}

export async function getRedis(): Promise<RedisClient> {
  if (!env.REDIS_URL) {
    throw new Error("getRedis() called without REDIS_URL configured");
  }
  if (client) {
    return client;
  }
  client = createClient({ url: env.REDIS_URL });
  client.on("error", (error: Error) => {
    logger.error("Redis client error", { error: error.message });
  });
  await client.connect();
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
```

- [ ] **Step 2: Add dependency**

Run: `cd apps/server && bun add redis`
Expected: `redis` (v5.x) added to `apps/server/package.json` dependencies.

- [ ] **Step 3: Eager validation + degraded-mode warning + shutdown in `index.ts`**

In `apps/server/src/index.ts`, after the `import { startWorker } ...` line add:

```ts
import { closeRedis, getRedis, isRedisEnabled } from "@/lib/redis";
```

Before the `serve(` call add:

```ts
if (isRedisEnabled()) {
  // Misconfigured REDIS_URL should fail loudly at boot, not at first request.
  await getRedis();
} else if (env.NODE_ENV === "production") {
  logger.warn(
    "REDIS_URL is not set: rate-limit counters are per-process and not shared across instances"
  );
}

const shutdown = async () => {
  await closeRedis();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```

- [ ] **Step 4: Verify**

Run: `bun run check-types && bun run check`
Expected: PASS. (No Redis server needed — nothing connects unless `REDIS_URL` is set.)

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/redis.ts apps/server/src/index.ts apps/server/package.json bun.lock
git commit -m "Add env-gated Redis client with boot validation and shutdown"
```

---

### Task 6: Better Auth rate-limit Redis storage

**Files:**
- Create: `apps/server/src/modules/auth/rate-limit-storage.ts`
- Test: `apps/server/tests/auth/rate-limit-storage.test.ts`
- Modify: `apps/server/src/modules/auth/instance.ts` (rateLimit block)
- Modify: `docs/security.md` (item 3)

**IMPORTANT — do NOT use Better Auth `secondaryStorage`:** when `secondaryStorage` is configured, Better Auth also moves session storage into it, which would break this template's DB-row-based single-session enforcement. Use `rateLimit.customStorage` instead, which scopes Redis to rate limiting only. Verify the exact `customStorage` type against `better-auth` 1.6.14 types (`RateLimit` is `{ key: string; count: number; lastRequest: number }`).

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/auth/rate-limit-storage.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createRedisRateLimitStorage } from "@/modules/auth/rate-limit-storage";

function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setEx: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return "OK";
    }),
  };
}

describe("createRedisRateLimitStorage", () => {
  it("should round-trip a rate limit entry", async () => {
    const fake = makeFakeRedis();
    const storage = createRedisRateLimitStorage(
      async () => fake as never,
      60
    );

    await storage.set("key1", { key: "key1", count: 3, lastRequest: 1000 });
    const entry = await storage.get("key1");

    expect(entry).toEqual({ key: "key1", count: 3, lastRequest: 1000 });
  });

  it("should set a TTL so keys cannot accumulate forever", async () => {
    const fake = makeFakeRedis();
    const storage = createRedisRateLimitStorage(async () => fake as never, 60);

    await storage.set("key1", { key: "key1", count: 1, lastRequest: 1 });

    expect(fake.setEx).toHaveBeenCalledWith(
      "ba-rate-limit:key1",
      120,
      expect.any(String)
    );
  });

  it("should return undefined for missing keys", async () => {
    const fake = makeFakeRedis();
    const storage = createRedisRateLimitStorage(async () => fake as never, 60);

    expect(await storage.get("missing")).toBeUndefined();
  });
});
```

(`as never` at the fake-client boundary is acceptable test fixture reflection per AGENTS.md; if lint complains, type the factory parameter structurally instead.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/server && bunx vitest run tests/auth/rate-limit-storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the storage**

Create `apps/server/src/modules/auth/rate-limit-storage.ts`:

```ts
import type { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

type RateLimitEntry = {
  key: string;
  count: number;
  lastRequest: number;
};

const KEY_PREFIX = "ba-rate-limit:";

export function createRedisRateLimitStorage(
  getClient: () => Promise<RedisClient>,
  windowSeconds: number
) {
  // TTL = 2x window so an entry always outlives its own window but never leaks.
  const ttlSeconds = windowSeconds * 2;

  return {
    get: async (key: string): Promise<RateLimitEntry | undefined> => {
      const client = await getClient();
      const raw = await client.get(KEY_PREFIX + key);
      if (!raw) {
        return;
      }
      return JSON.parse(raw) as RateLimitEntry;
    },
    set: async (key: string, value: RateLimitEntry): Promise<void> => {
      const client = await getClient();
      await client.setEx(KEY_PREFIX + key, ttlSeconds, JSON.stringify(value));
    },
  };
}
```

(`JSON.parse` cast is a validated-boundary pattern: we are the only writer of these keys. If review prefers, add a Zod parse.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/server && bunx vitest run tests/auth/rate-limit-storage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into the auth instance**

In `apps/server/src/modules/auth/instance.ts`, add imports:

```ts
import { createRedisRateLimitStorage } from "@/modules/auth/rate-limit-storage";
import { getRedis, isRedisEnabled } from "@/lib/redis";
```

Replace the `rateLimit` block:

```ts
  // Global rate-limit must sit above the per-account lockout so our lockout fires first.
  // customStorage (not secondaryStorage): secondaryStorage would also move session
  // storage into Redis and break DB-row-based single-session enforcement.
  rateLimit: {
    enabled: true,
    window: RATE_LIMIT_CONFIG.global.window,
    max: RATE_LIMIT_CONFIG.global.max,
    ...(isRedisEnabled()
      ? {
          customStorage: createRedisRateLimitStorage(
            getRedis,
            RATE_LIMIT_CONFIG.global.window
          ),
        }
      : { storage: "memory" as const }),
    customRules: {
      "/sign-in/email": {
        window: RATE_LIMIT_CONFIG.signIn.window,
        max: RATE_LIMIT_CONFIG.signIn.max,
      },
    },
  },
```

If Better Auth's types require `storage: "custom"` alongside `customStorage`, follow the types.

- [ ] **Step 6: Verify**

Run: `bun run check-types && cd apps/server && bunx vitest run`
Expected: PASS.

- [ ] **Step 7: Update `docs/security.md` item 3**

Replace section "## 3. In-memory rate limiter" body with:

```markdown
**Status: FIXED (2026-06), env-gated.** When `REDIS_URL` is set, both Better Auth
(`rateLimit.customStorage`, `apps/server/src/modules/auth/rate-limit-storage.ts`)
and the global Hono limiter store counters in Redis, so limits hold across
replicas. Without `REDIS_URL` the previous in-memory behavior applies and the
server logs a warning at boot in production. `customStorage` is used instead of
`secondaryStorage` deliberately: `secondaryStorage` would also relocate session
storage and break single-session enforcement.
```

Update its summary-table row to `Fixed — Redis-backed when REDIS_URL is set; warns in prod otherwise.`

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/modules/auth/rate-limit-storage.ts apps/server/tests/auth/rate-limit-storage.test.ts apps/server/src/modules/auth/instance.ts docs/security.md
git commit -m "Store Better Auth rate-limit counters in Redis when configured"
```

---

### Task 7: Redis store for the global limiter + compose wiring

**Files:**
- Modify: `apps/server/src/middlewares/rate-limit.ts`
- Modify: `compose.prod.yaml` (server service environment)

- [ ] **Step 1: Add dependency**

Run: `cd apps/server && bun add rate-limit-redis`

- [ ] **Step 2: Wire the store**

In `apps/server/src/middlewares/rate-limit.ts`, add imports:

```ts
import { RedisStore } from "rate-limit-redis";
import { getRedis, isRedisEnabled } from "@/lib/redis";
```

Add a store to the `rateLimiter` options (after `limit`):

```ts
  ...(isRedisEnabled()
    ? {
        store: new RedisStore({
          prefix: "global-rl:",
          sendCommand: async (...args: string[]) => {
            const client = await getRedis();
            return client.sendCommand(args);
          },
        }),
      }
    : {}),
```

Note: `rate-limit-redis` is express-rate-limit-store compatible, which `hono-rate-limiter` accepts. If the `Store` type from `hono-rate-limiter` rejects it, cast at the boundary with `// boundary: rate-limit-redis implements the express-rate-limit Store contract hono-rate-limiter consumes`.

- [ ] **Step 3: Add `REDIS_URL` to the prod compose server service**

In `compose.prod.yaml`, find the server/app service `environment:` block (the service built from `deploy/Dockerfile`, depends_on includes `redis`) and add:

```yaml
      REDIS_URL: redis://redis:6379
```

- [ ] **Step 4: Verify**

Run: `bun run check-types && cd apps/server && bunx vitest run`
Expected: PASS (tests mock this middleware module).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/middlewares/rate-limit.ts apps/server/package.json bun.lock compose.prod.yaml
git commit -m "Back global rate limiter with Redis when configured"
```

---

### Task 8: Delete the unused `is-authenticated` guard

**Files:**
- Delete: `apps/server/src/middlewares/guard/is-authenticated.ts`
- Modify: `knip.config.ts`

- [ ] **Step 1: Delete and clean knip config**

```bash
rm apps/server/src/middlewares/guard/is-authenticated.ts
```

In `knip.config.ts`, remove these two lines from `apps/server.ignoreFiles`:

```ts
        // Auth guard: not yet applied to any route; keep until first protected route lands.
        "src/middlewares/guard/is-authenticated.ts",
```

- [ ] **Step 2: Verify nothing referenced it**

Run: `grep -rn "is-authenticated\|isAuthenticated" apps/server/src apps/web/src` — expect no hits.
Run: `bun run check-types && bun run knip`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Delete unused isAuthenticated guard"
```

---

### Task 9: Vault unit tests + documentation

**Files:**
- Test: `apps/server/tests/vault/local-provider.test.ts`
- Modify: `knip.config.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the tests** (they should pass immediately — this is characterization of existing code)

Create `apps/server/tests/vault/local-provider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  createVault,
  generateMasterKey,
  LocalEncryptionProvider,
  VaultError,
} from "@/lib/vault";

const MASTER_KEY = generateMasterKey();

describe("LocalEncryptionProvider", () => {
  it("should round-trip plaintext through encrypt and decrypt", async () => {
    const provider = new LocalEncryptionProvider(MASTER_KEY, "test-key");
    const plaintext = Buffer.from("super-secret-value", "utf8");

    const envelope = await provider.encrypt(plaintext);
    const decrypted = await provider.decrypt(envelope);

    expect(decrypted.toString("utf8")).toBe("super-secret-value");
    expect(envelope.alg).toBe("aes-256-gcm");
    expect(envelope.kid).toBe("test-key");
  });

  it("should fail to decrypt with a different master key", async () => {
    const provider = new LocalEncryptionProvider(MASTER_KEY);
    const otherProvider = new LocalEncryptionProvider(generateMasterKey());
    const envelope = await provider.encrypt(Buffer.from("secret"));

    await expect(otherProvider.decrypt(envelope)).rejects.toThrow();
  });

  it("should reject tampered ciphertext via the GCM auth tag", async () => {
    const provider = new LocalEncryptionProvider(MASTER_KEY);
    const envelope = await provider.encrypt(Buffer.from("secret"));

    const combined = Buffer.from(envelope.ct, "base64");
    // Flip one bit inside the ciphertext region (past salt+iv+authTag = 44 bytes).
    const lastIndex = combined.length - 1;
    const lastByte = combined[lastIndex];
    if (lastByte === undefined) {
      throw new Error("unexpected empty ciphertext");
    }
    combined[lastIndex] = lastByte ^ 0x01;
    const tampered = { ...envelope, ct: combined.toString("base64") };

    await expect(provider.decrypt(tampered)).rejects.toThrow();
  });

  it("should reject construction with a malformed master key", () => {
    expect(() => new LocalEncryptionProvider("too-short")).toThrow(
      /64 characters/
    );
  });
});

describe("Vault", () => {
  it("should wrap provider failures in VaultError on decrypt", async () => {
    const vault = createVault({ provider: "local", masterKey: MASTER_KEY });

    await expect(vault.decryptRaw("not-json")).rejects.toBeInstanceOf(
      VaultError
    );
  });

  it("should round-trip via encryptRaw and decryptRaw", async () => {
    const vault = createVault({ provider: "local", masterKey: MASTER_KEY });

    const encrypted = await vault.encryptRaw("hello");
    const decrypted = await vault.decryptRaw(encrypted);

    expect(decrypted.toString("utf8")).toBe("hello");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/server && bunx vitest run tests/vault/local-provider.test.ts`
Expected: PASS (6 tests). If the tamper test does not throw, the bit flip landed in the salt region — flip `combined[combined.length - 1]` only (as written) which is always ciphertext for non-empty plaintext.

- [ ] **Step 3: Try removing the vault knip ignore**

In `knip.config.ts`, remove from `apps/server.ignoreFiles`:

```ts
        // Vault module: env vars declared; keep until first consumer wires it up.
        "src/lib/vault/**",
```

Run: `bun run knip`. If vault files are now tracked through the test entry (tests are knip entries), keep the removal. If knip still reports unused vault exports/files, restore a narrower ignore (`"src/lib/vault/instance.ts"` only) with comment `// Vault singleton: documented primitive, no production consumer yet.`

- [ ] **Step 4: Document the primitive in README**

In `README.md`, add a short subsection under the features/architecture area (match surrounding heading level):

```markdown
### Secrets vault (available primitive)

`apps/server/src/lib/vault/` ships an envelope-encryption vault
(AES-256-GCM via a local master key; AWS/GCP/Azure KMS provider stubs).
It has no default consumer — wire it wherever you store third-party
credentials or other secrets at rest. See `vault:debug` script and
`apps/server/tests/vault/` for usage examples. Configure via
`VAULT_PROVIDER` / `VAULT_MASTER_KEY`.
```

- [ ] **Step 5: Verify and commit**

Run: `bun run check && bun run knip && bun run check-types`
Expected: PASS.

```bash
git add apps/server/tests/vault/local-provider.test.ts knip.config.ts README.md
git commit -m "Add vault local provider tests and document it as a primitive"
```

---

### Task 10: Test infra — hermetic env defaults + Postgres in CI

**Files:**
- Modify: `apps/server/vitest.config.ts`
- Modify: `apps/server/tests/fixtures.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Make vitest env conditional on a test database**

In `apps/server/vitest.config.ts`, replace the `env` block:

```ts
    env: {
      SKIP_ENV_VALIDATION: "true",
      // DB-backed tests run only when a test database is provided (CI always
      // provides one; locally export DATABASE_TEST_URL to opt in).
      SKIP_DB: process.env.DATABASE_TEST_URL ? "false" : "true",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "test-only-secret-not-for-prod",
      BETTER_AUTH_URL: "http://localhost:3000",
      CORS_ORIGIN: process.env.CORS_ORIGIN ?? "http://localhost:3001",
    },
```

- [ ] **Step 2: Add the gating helper to fixtures**

Append to `apps/server/tests/fixtures.ts`:

```ts
export const hasTestDb = Boolean(process.env.DATABASE_TEST_URL);
```

- [ ] **Step 3: Add the Postgres service and test env to CI**

In `.github/workflows/ci.yml`, inside the `validate` job (same indentation level as `steps:`), add:

```yaml
    services:
      postgres:
        image: postgis/postgis:18-3.6
        env:
          POSTGRES_DB: postgres
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
```

And change the test step to:

```yaml
      - name: Test
        run: bun run test
        env:
          DATABASE_TEST_URL: postgresql://postgres:postgres@localhost:5432/postgres
```

- [ ] **Step 4: Verify locally (both modes)**

Run without DB: `cd apps/server && bunx vitest run` — expect PASS (db tests skipped, none exist yet).
Run with DB (requires local compose postgres): `cd apps/server && DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres bunx vitest run` — expect PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/vitest.config.ts apps/server/tests/fixtures.ts .github/workflows/ci.yml
git commit -m "Run tests against Postgres in CI with opt-in local test database"
```

---

### Task 11: Server sign-up flag + behavioral test

**Files:**
- Modify: `apps/server/src/modules/auth/instance.ts` (emailAndPassword block)
- Test: `apps/server/tests/auth/signup-flag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/tests/auth/signup-flag.test.ts`:

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { hasTestDb } from "../fixtures";
import { clearDatabase, migrateDatabase } from "../setup";

const signUpPayload = {
  name: "Signup Test",
  email: "signup-test@example.com",
  password: "SignupPassword123!",
};

async function loadAuthWithSignup(enabled: boolean) {
  vi.resetModules();
  vi.doMock("@/env", async () => {
    const actual = await vi.importActual<typeof import("@/env")>("@/env");
    return { env: { ...actual.env, ENABLE_SIGNUP: enabled } };
  });
  const { auth } = await import("@/modules/auth/instance");
  return auth;
}

async function postSignUp(auth: { handler: (req: Request) => Promise<Response> }) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3001",
      },
      body: JSON.stringify(signUpPayload),
    })
  );
}

describe.skipIf(!hasTestDb)("sign-up flag", () => {
  beforeAll(async () => {
    await migrateDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
    vi.doUnmock("@/env");
  });

  afterAll(() => {
    vi.resetModules();
  });

  it("should reject sign-up when ENABLE_SIGNUP is false", async () => {
    const auth = await loadAuthWithSignup(false);
    const response = await postSignUp(auth);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("should create the user when ENABLE_SIGNUP is true", async () => {
    const auth = await loadAuthWithSignup(true);
    const response = await postSignUp(auth);

    expect(response.status).toBe(200);

    const { db } = await import("@/db");
    const { users } = await import("@repo/db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.email, signUpPayload.email))
      .limit(1);

    expect(row?.email).toBe(signUpPayload.email);
    expect(row?.emailVerified).toBe(false);
  });
});
```

Adaptation notes for the executor: `@/db` is also re-evaluated by `vi.resetModules()`; if pool re-creation causes open-handle warnings, import `db` once at file top instead and only re-import the auth instance. If Better Auth rejects the request for a missing field, check the exact sign-up payload contract in `better-auth` 1.6.14 (it accepts `name`, `email`, `password`).

- [ ] **Step 2: Run to verify it fails for the right reason**

Run: `cd apps/server && DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres bunx vitest run tests/auth/signup-flag.test.ts`
Expected: first test FAILS (sign-up currently always enabled → 200), second PASSES. That failure proves the test detects the flag.

- [ ] **Step 3: Implement the flag**

In `apps/server/src/modules/auth/instance.ts`, change the `emailAndPassword` block:

```ts
  emailAndPassword: {
    enabled: true,
    disableSignUp: !env.ENABLE_SIGNUP,
    requireEmailVerification: true,
```

- [ ] **Step 4: Run tests to verify both pass**

Run: `cd apps/server && DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres bunx vitest run tests/auth/signup-flag.test.ts`
Expected: PASS (2 tests). Also run the full suite without `DATABASE_TEST_URL` and confirm the file is skipped.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/auth/instance.ts apps/server/tests/auth/signup-flag.test.ts
git commit -m "Gate self-serve sign-up behind ENABLE_SIGNUP"
```

---

### Task 12: Web sign-up flow

**Files:**
- Modify: `apps/web/src/lib/auth-client.ts` (add emailOTPClient)
- Create: `apps/web/src/modules/auth/sign-up-form.tsx`
- Create: `apps/web/src/modules/auth/sign-up-verify-step.tsx`
- Modify: `apps/web/src/modules/auth/index.ts`
- Create: `apps/web/src/routes/signup.tsx`
- Modify: `apps/web/src/routes/login.tsx` (conditional link)
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Add the emailOTP client plugin**

In `apps/web/src/lib/auth-client.ts`, extend the plugin import and list:

```ts
import {
  emailOTPClient,
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
```

and add `emailOTPClient(),` to the `plugins: [` array (before `organizationClient()`).

- [ ] **Step 2: Create `SignUpForm`**

Create `apps/web/src/modules/auth/sign-up-form.tsx` (mirrors `sign-in-form.tsx` styling):

```tsx
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { Label } from "@/modules/ui/label";

interface SignUpFormProps {
  onVerificationRequired: (email: string, password: string) => void;
}

export function SignUpForm({ onVerificationRequired }: SignUpFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!(name && email && password)) {
      toast.error("Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      const result = await authClient.signUp.email({ name, email, password });

      if (result.error) {
        toast.error(result.error.message ?? "Sign up failed");
        return;
      }

      toast.success("Account created. Check your email for a verification code.");
      onVerificationRequired(email, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign up failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          autoComplete="name"
          disabled={isLoading}
          id="name"
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          value={name}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          disabled={isLoading}
          id="email"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          autoComplete="new-password"
          disabled={isLoading}
          id="password"
          minLength={8}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create a password"
          required
          type="password"
          value={password}
        />
      </div>

      <Button className="w-full" disabled={isLoading} type="submit">
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" />
            Creating account...
          </>
        ) : (
          "Create account"
        )}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Create the verification step**

First read `apps/web/src/modules/auth/two-factor-verify-step.tsx` and reuse its OTP input component/pattern. Create `apps/web/src/modules/auth/sign-up-verify-step.tsx`:

```tsx
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { Label } from "@/modules/ui/label";
import { sessionQueryOptions } from "@/query/session-query";

interface SignUpVerifyStepProps {
  email: string;
  password: string;
  onSuccess: () => void;
  onBack: () => void;
}

export function SignUpVerifyStep({
  email,
  password,
  onSuccess,
  onBack,
}: SignUpVerifyStepProps) {
  const queryClient = useQueryClient();
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const verifyResult = await authClient.emailOtp.verifyEmail({
        email,
        otp,
      });

      if (verifyResult.error) {
        toast.error(verifyResult.error.message ?? "Verification failed");
        return;
      }

      // Held credentials let us sign the user in without a second login step.
      const signInResult = await authClient.signIn.email({ email, password });

      if (signInResult.error) {
        toast.success("Email verified. Please sign in.");
        onBack();
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: sessionQueryOptions.queryKey,
      });
      toast.success("Welcome!");
      onSuccess();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Verification failed";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="otp">Verification code</Label>
        <Input
          autoComplete="one-time-code"
          disabled={isLoading}
          id="otp"
          inputMode="numeric"
          onChange={(e) => setOtp(e.target.value)}
          placeholder="Enter the code from your email"
          required
          value={otp}
        />
      </div>

      <Button className="w-full" disabled={isLoading || !otp} type="submit">
        {isLoading ? (
          <>
            <Loader2 className="animate-spin" />
            Verifying...
          </>
        ) : (
          "Verify email"
        )}
      </Button>

      <Button
        className="w-full"
        disabled={isLoading}
        onClick={onBack}
        type="button"
        variant="ghost"
      >
        Back
      </Button>
    </form>
  );
}
```

Adapt to the project's existing OTP input if `two-factor-verify-step.tsx` uses a dedicated OTP component (e.g. `InputOTP`) — match that pattern instead of a plain `Input`.

- [ ] **Step 4: Export from the auth module barrel**

In `apps/web/src/modules/auth/index.ts` add:

```ts
export { SignUpForm } from "./sign-up-form";
export { SignUpVerifyStep } from "./sign-up-verify-step";
```

- [ ] **Step 5: Create the `/signup` route**

Create `apps/web/src/routes/signup.tsx`:

```tsx
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/assets/logo";
import {
  AuthStepTransition,
  SignUpForm,
  SignUpVerifyStep,
} from "@/modules/auth";
import { LoginLeftPanel } from "@/modules/auth/login-left-panel";
import { sessionQueryOptions } from "@/query/session-query";

const signupEnabled = import.meta.env.VITE_ENABLE_SIGNUP === "true";

export const Route = createFileRoute("/signup")({
  component: RouteComponent,
  beforeLoad: ({ context }) => {
    if (!signupEnabled) {
      throw redirect({ to: "/login" });
    }
    const session = context.queryClient.getQueryData(
      sessionQueryOptions.queryKey
    );
    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
});

type SignupStep = "form" | "verify";

function RouteComponent() {
  const navigate = useNavigate();
  const [step, setStep] = useState<SignupStep>("form");
  const [credentials, setCredentials] = useState({ email: "", password: "" });

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden md:block">
        <LoginLeftPanel />
      </div>
      <div className="flex w-full items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-8 text-left">
          <Logo className="mb-8 size-12 md:hidden" />

          <AuthStepTransition step={step}>
            {step === "form" && (
              <div className="space-y-8">
                <div>
                  <h1 className="mb-2 font-bold text-3xl text-foreground">
                    Create your account
                  </h1>
                  <p className="text-muted-foreground">
                    Already have an account?{" "}
                    <Link className="text-primary underline" to="/login">
                      Sign in
                    </Link>
                  </p>
                </div>
                <SignUpForm
                  onVerificationRequired={(email, password) => {
                    setCredentials({ email, password });
                    setStep("verify");
                  }}
                />
              </div>
            )}

            {step === "verify" && (
              <div className="space-y-8">
                <div>
                  <h1 className="mb-2 font-bold text-3xl text-foreground">
                    Verify your email
                  </h1>
                  <p className="text-muted-foreground">
                    We sent a verification code to {credentials.email}.
                  </p>
                </div>
                <SignUpVerifyStep
                  email={credentials.email}
                  onBack={() => setStep("form")}
                  onSuccess={() => navigate({ to: "/dashboard" })}
                  password={credentials.password}
                />
              </div>
            )}
          </AuthStepTransition>
        </div>
      </div>
    </div>
  );
}
```

Check `AuthStepTransition`'s `step` prop type — if it's typed to the login steps union, widen it to `string` or pass a compatible value.

- [ ] **Step 6: Add the conditional link on the login page**

In `apps/web/src/routes/login.tsx`, in the `step === "fresh"` block, after the `<SignInForm ... />` element add:

```tsx
                {import.meta.env.VITE_ENABLE_SIGNUP === "true" && (
                  <p className="text-muted-foreground text-sm">
                    No account?{" "}
                    <Link className="text-primary underline" to="/signup">
                      Create one
                    </Link>
                  </p>
                )}
```

and add `Link` to the `@tanstack/react-router` import.

- [ ] **Step 7: Document the web env var**

Append to `apps/web/.env.example`:

```bash
# Show the self-serve signup route. Must match the server's ENABLE_SIGNUP.
VITE_ENABLE_SIGNUP=true
```

- [ ] **Step 8: Verify**

Run: `bun run fix && bun run check-types && bun run knip`
Expected: PASS. (Route files are knip entries; the new components are reached via the barrel.)

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "Add env-gated self-serve sign-up flow with email verification"
```

---

### Task 13: CI build step + migration drift check

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add steps after the Knip step (before Test)**

```yaml
      - name: Build
        run: bun run build

      - name: Migration drift check
        run: |
          bun run db:generate
          git add -N packages/db/src/migrations
          git diff --exit-code -- packages/db/src/migrations
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/postgres
```

Notes: `drizzle-kit generate` is offline (no DB connection) but `drizzle.config.ts` requires `DATABASE_URL` to be present. `git add -N` makes brand-new migration files visible to `git diff` so an uncommitted generated migration fails the check.

- [ ] **Step 2: Verify locally**

Run: `bun run db:generate && git status --porcelain packages/db/src/migrations`
Expected: empty output (no drift on a clean tree). If drizzle-kit generates a new migration on a clean tree, STOP and report — that is pre-existing drift the user must resolve (migrations are generate-only per project policy; never hand-edit).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add build and migration drift check to CI"
```

---

### Task 14: Changesets release automation

**Files:**
- Create: `.changeset/config.json` (via init)
- Create: `.github/workflows/release.yml`
- Modify: `README.md`
- Modify: `knip.config.ts` (only if knip flags @changesets/cli — it has built-in changesets detection)

- [ ] **Step 1: Install and init**

```bash
bun add -D @changesets/cli
bunx changeset init
```

- [ ] **Step 2: Configure for a private monorepo**

Replace `.changeset/config.json` with:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "privatePackages": { "version": true, "tag": true },
  "ignore": []
}
```

(Check the installed `@changesets/config` version for the `$schema` URL; match it.)

- [ ] **Step 3: Create the release workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    branches:
      - main

concurrency: release-${{ github.ref }}

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    name: release
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd # v5
        with:
          fetch-depth: 0

      - name: Setup Bun
        uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
        with:
          bun-version: 1.3.14

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Create release PR or tag release
        uses: changesets/action@e2f8e964d080ae97c874b51f4c1a39ceb6af89c0 # v1.4.10
        with:
          version: bunx changeset version
          publish: bunx changeset tag
          commit: "Version packages"
          title: "Version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Verify the changesets/action pinned SHA against the latest v1 release on github.com/changesets/action before committing; use the current v1 tag's SHA.

- [ ] **Step 4: Add a README note**

Add to `README.md` (near contributing/development section):

```markdown
### Releases

Versioning uses [Changesets](https://github.com/changesets/changesets). Add a
changeset to any user-facing PR with `bunx changeset`. On merge to `main`, CI
opens a "Version packages" PR; merging that PR tags a release and updates
changelogs.
```

- [ ] **Step 5: Verify**

Run: `bunx changeset status` — expect "No changesets present" (clean state, exit 0).
Run: `bun run knip` — if `@changesets/cli` is flagged, add `"@changesets/cli"` to the root workspace `ignoreDependencies` in `knip.config.ts` with no comment needed.

- [ ] **Step 6: Commit**

```bash
git add .changeset .github/workflows/release.yml README.md package.json bun.lock knip.config.ts
git commit -m "Add Changesets release automation"
```

---

### Task 15: Final validation sweep

**Files:**
- Modify: `docs/security.md` (only if summary table was missed in earlier tasks)

- [ ] **Step 1: Full local validation**

```bash
bun run fix
bun run check
bun run check-types
bun run knip
bun run test
bun run build
```

Expected: all PASS. Fix anything that fails (running `bun run fix` first per project policy).

- [ ] **Step 2: DB-backed test pass**

With local compose Postgres running:

```bash
cd apps/server && DATABASE_TEST_URL=postgresql://postgres:postgres@localhost:5432/postgres bunx vitest run
```

Expected: PASS including `signup-flag.test.ts`.

- [ ] **Step 3: Review `docs/security.md` end-to-end**

Confirm items 2, 3, 4 read as fixed with accurate file pointers, item 1 untouched, and the summary table matches. Fix any miss.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "Finalize Priority 2 hardening docs"
```

---

## Spec coverage map

| Spec section | Tasks |
|---|---|
| 1. UA trust bypass | 4 |
| 2. Rate-limit keying | 1, 2, 3 |
| 3. Redis rate limiting | 1, 5, 6, 7 |
| 4. Guard delete / vault keep | 8, 9 |
| 5. Tests + CI Postgres | 10, 11 (test), 2/6/9 (unit tests) |
| 6. CI deepening + Changesets | 13, 14 |
| 7. Sign-up flag | 1, 11, 12 |

## Known deviations from spec

- No integration regression test for the trusted-origins fix: after removal the option is a static allowlist; a test would restate configuration (minimalism rule). The sign-up flag test covers the auth-instance-boots-against-real-DB path instead.
- Better Auth Redis storage uses `rateLimit.customStorage`, not `secondaryStorage` — `secondaryStorage` would also move session storage to Redis and silently break DB-row single-session enforcement. Spec section 3 said "secondaryStorage"; `customStorage` achieves the spec's intent (Redis-backed rate limiting) without the session side effect.
