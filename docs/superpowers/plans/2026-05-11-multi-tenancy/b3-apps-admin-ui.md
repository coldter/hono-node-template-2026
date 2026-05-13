# B3 — `apps/admin-ui` rename

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Status (2026-05-12+):** Scope shrunk. B3 is now a path-level rename refactor: `apps/web` → `apps/admin-ui`. The existing route tree, components, queries, and Storybook config stay intact. The renamed app becomes the operator/admin UI consuming `apps/admin-server`. No new SPA. No fresh sign-in pages, no new shadcn init, no Storybook re-init.

**Goal:** Rename `apps/web` to `apps/admin-ui`. Rewire imports, alias paths, Vite config, openapi-client output, compose service entry, and Caddyfile dev/prod blocks. Repoint the BA client at `apps/admin-server` (operator BA host).

**Architecture:** The existing TanStack Router file-based routes under `apps/web/src/routes/` move intact to `apps/admin-ui/src/routes/`. BA client baseURL stays at `window.location.origin` (which now resolves to the admin host). Caddy serves `dist/` for `admin.example.com`.

**References:** spec § 06.

> **Cross-app type import:** Use a `tsconfig` path alias in `apps/admin-ui/tsconfig.json`: `"@admin-server/auth": ["../../apps/admin-server/src/modules/auth/instance"]` (type-only). Do NOT create a `packages/auth-types` workspace package for a single `export type` — that is shallow.

> **Rename is intact-move, not rebuild:** B3 is a path-level rename + auth-client rebind. No new shadcn init, no new routes, no new components, no new Storybook setup. The existing `apps/web` content is the source of truth; this task moves it intact. All UI work that previously assumed a greenfield admin-ui SPA is dropped — those features already exist in `apps/web` and port over for free.

---

## Task B3.1: Move + rename `apps/web` → `apps/admin-ui`

**Files:**
- Move: every file under `apps/web/` to `apps/admin-ui/`
- Modify: `apps/admin-ui/package.json` (`name` field — match existing scope convention used by `@repo/*` packages, e.g. `@apps/admin-ui`)
- Modify: `apps/admin-ui/tsconfig.json` (path references; add `@admin-server/auth` alias if not already present)
- Modify: root `package.json` workspaces if the entry is explicit (not glob)
- Modify: any cross-package imports referencing `@apps/web` (none expected for a SPA, but verify)
- Test: `apps/admin-ui/__tests__/rename.test.ts`

- [ ] **Step 1: Failing test** — `bun --filter @apps/admin-ui build` succeeds; the package name reflects `@apps/admin-ui`; no stale `apps/web` import path resolves.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — move every file under `apps/web/` to `apps/admin-ui/` (use `mv` if available, otherwise copy+delete). Update `package.json` `name`. Sweep for any string `apps/web` across the moved files; update where it referred to its own path.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B3.2: Regenerate `api.gen/` against `apps/admin-server`

**Files:**
- Modify: `apps/admin-ui/openapi-ts.config.ts` (input path now `../admin-server/dist/openapi.json`)
- Regenerate: `apps/admin-ui/src/api.gen/` (or whatever the existing output directory was — keep the existing naming convention)
- Update: any `routeTree.gen.ts` references that depend on the moved path
- Test: smoke test that imports a generated hook compiles

> **Carve-out from B7:** B7's single OpenAPI writer pattern (one `dump-openapi.ts` writer that imports the existing `apps/admin-server/src/lib/docs.ts` instance + drops any runtime-write side-effect) is folded into this task. One writer, one output, one consumer.

- [ ] **Step 1: Failing test** — regenerated client contains operator routes from `apps/admin-server`, not tenant routes from `apps/server`; smoke test importing a representative hook compiles.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — point `openapi-ts.config.ts` at `apps/admin-server`'s OpenAPI dump. Run the generator. Update any imports that reference the old generated types if their shape shifted.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B3.3: Update Vite + build config + alias paths

**Files:**
- Modify: `apps/admin-ui/vite.config.ts` (alias `@` resolves to `apps/admin-ui/src`; dev port unchanged from `apps/web` value)
- Modify: any other build config (`tsconfig.json` `paths`, `components.json` if it has path entries)

- [ ] **Step 1: Failing test** — `bun --filter @apps/admin-ui dev --port <existing>` boots, alias `@/...` resolves, build emits `dist/`.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — update aliases. Dev port and base config stay the same as the old `apps/web`.

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Task B3.4: Update `compose.yaml` + Caddyfiles

**Files:**
- Modify: `compose.yaml` (rename the `apps/web` service entry to `apps/admin-ui`)
- Modify: `deploy/Caddyfile.dev` (serve `apps/admin-ui` build output behind `admin.localhost`)
- Modify: `deploy/Caddyfile.prod` (serve `apps/admin-ui` build output behind `${ADMIN_HOST}`)

- [ ] **Step 1: Failing test** — `docker compose config` validates with the renamed service; Caddy config parse (`caddy validate`) succeeds; the admin-ui static path resolves.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — surgical rename in the compose service block + Caddyfile UI-serving blocks. Volume mounts, build context, and ports update to reflect the new path.

- [ ] **Step 4: Lint + self-review**

## Task B3.5: Update README + AGENTS docs

**Files:**
- Modify: root `README.md` (any `apps/web` reference)
- Modify: root `AGENTS.md`, `apps/admin-ui/AGENTS.md` (renamed from `apps/web/AGENTS.md`)
- Modify: any `.agent-docs/*.md` that names `apps/web`
- Modify: any doc under `docs/` that names `apps/web`

- [ ] **Step 1: Grep `apps/web` repo-wide** — list every hit.

- [ ] **Step 2: Update each reference** — `apps/web` → `apps/admin-ui` except where the reference is historical (changelogs, archived specs).

- [ ] **Step 3: Lint + self-review**

## Task B3.6: BA client rebound against `apps/admin-server`

**Files:**
- Modify: `apps/admin-ui/src/lib/auth-client.ts` (formerly `apps/web/src/lib/auth-client.ts`)
- Test: `apps/admin-ui/src/lib/__tests__/auth-client.test.ts`

**Rationale:** The existing auth client was wired against `apps/server`'s BA. Now it points at `apps/admin-server` (operator BA). Use the tsconfig alias `@admin-server/auth` for `inferAdditionalFields<typeof auth>()` so the type sharing is cheap and explicit.

- [ ] **Step 1: Failing test** — `authClient`'s `inferAdditionalFields` type slot is keyed against `@admin-server/auth`'s `typeof auth`, not the old tenant BA. Smoke: `useSession()` returns operator session shape.

- [ ] **Step 2: Run, watch fail**

- [ ] **Step 3: Implement** — change the type import in `auth-client.ts` from the tenant BA to `@admin-server/auth`. The runtime `baseURL` stays `window.location.origin` (Caddy front-doors the admin host to the admin-server).

```ts
import { createAuthClient } from "better-auth/react";
import { twoFactorClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@admin-server/auth"; // type-only path alias; see tsconfig.json

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [twoFactorClient(), inferAdditionalFields<typeof auth>()],
});
export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 4: Run tests + lint**

- [ ] **Step 5: Self-review**

## Exit criteria

- [ ] `apps/web/` no longer exists; `apps/admin-ui/` contains the moved tree intact.
- [ ] `bun --filter @apps/admin-ui build` succeeds and emits `dist/`.
- [ ] `api.gen/` is regenerated against `apps/admin-server`'s OpenAPI; smoke import compiles.
- [ ] `compose.yaml` + Caddyfiles serve the renamed app at the admin host.
- [ ] All `apps/web` references in docs/AGENTS files are updated.
- [ ] BA client `inferAdditionalFields` types resolve from `@admin-server/auth`.
