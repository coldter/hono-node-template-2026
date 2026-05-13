# 06 — Web Layer

All frontend versions cross-checked against current 2026 sources as of 2026-05-11.

## Split: `apps/admin-ui` + `apps/app`

`apps/web` is renamed to `apps/app` (decision D39 port — clarifies intent). New `apps/admin-ui` is the operator panel. Both are TanStack Router + Vite + React 19 SPAs served by Caddy from `dist/`.

### Stack (locked)

| Concern | Version (May 2026) | Source |
|---|---|---|
| React | **19.2.6** (no React 20 yet) — React Compiler stable, `useEffectEvent`, `useActionState` canonical | https://react.dev/versions |
| Vite | **Vite 8.0** (March 2026) — Rolldown default, Oxc, integrated devtools, Wasm SSR, tsconfig paths, `emitDecoratorMetadata` native | https://vite.dev/blog/announcing-vite8 |
| Bundler | Rolldown (via Vite 8) | https://voidzero.dev/posts/announcing-rolldown-1-0 |
| TanStack Router | **`@tanstack/react-router@1.169.2`** + `@tanstack/router-plugin` Vite plugin | https://tanstack.com/router/latest |
| TanStack Query | **`@tanstack/react-query@5.100.9`** | https://github.com/tanstack/query/releases |
| TanStack Table | **`@tanstack/react-table@8.21.3`** stable (v9 still alpha; do not adopt) | https://github.com/TanStack/table/releases |
| Tailwind CSS | **v4.x stable** (Oxide engine, CSS-first via `@import "tailwindcss";` + `@theme { ... }`) — no JS preset packaging | https://tailwindcss.com/blog/tailwindcss-v4 |
| shadcn/ui | **CLI v4** (March 2026) — `shadcn init --monorepo`, `registry:base`, `@workspace/ui/components/*` imports | https://ui.shadcn.com/docs/monorepo · https://ui.shadcn.com/docs/changelog/2026-03-cli-v4 |
| Storybook | **10.x** (no 11.x yet) + `@storybook/addon-vitest` (legacy `@storybook/test-runner` deprecated) | https://storybook.js.org/docs/writing-tests/integrations/vitest-addon |
| Vitest | **4.1.x** — Browser Mode stable; install `@vitest/browser-playwright` separately | https://vitest.dev/blog/vitest-4-1.html |
| Typed API client | **`@hey-api/openapi-ts`** — generates TanStack Query hooks + Zod schemas; pin exact versions (pre-1.0) | https://github.com/hey-api/openapi-ts |
| Better Auth client | `better-auth/react` `createAuthClient` (unchanged shape) | https://better-auth.com/docs/concepts/client |

### `apps/admin-ui`

- Route tree at `apps/admin-ui/src/routes/` — file-based.
- `auth-client.ts`:
  ```ts
  export const authClient = createAuthClient({
    baseURL: window.location.origin,      // resolves to admin.example.com in prod
    plugins: [twoFactorClient(), inferAdditionalFields<typeof adminAuth>()],
  });
  ```
- Routes (representative):
  - `/(public)/enroll?token=...` — first-operator enrollment.
  - `/(public)/sign-in` — operator credentials.
  - `/(protected)/tenants` — list.
  - `/(protected)/tenants/$orgId` — detail + suspend/restore.
  - `/(protected)/tenants/$orgId/sso-providers` — manage OIDC providers.
  - `/(protected)/tenants/$orgId/hostnames` — operator view of custom-hostname lifecycle.
  - `/(protected)/global-admins` — invite/revoke.
  - `/(protected)/audit-logs` — read-only.

### `apps/app` (tenant SPA)

- Renamed from `apps/web`.
- `auth-client.ts`:
  ```ts
  export const authClient = createAuthClient({
    baseURL: window.location.origin,      // resolves to {slug}.app.example.com or custom host
    plugins: [twoFactorClient(), organizationClient(), inferAdditionalFields<typeof tenantAuth>()],
  });
  ```
- Routes (representative):
  - `/(public)/accept-invite/$invitationId` — outside `(protected)` per D48.
  - `/(public)/sign-in`, `/(public)/sign-up-via-invite`.
  - `/(protected)/*` — tenant app.
  - **`/sso/callback` is NOT an `apps/app` route** — handled by BA at `/api/auth/sso/callback/:providerId` (D64 port).

### Serving strategy

- Caddy `file_server` serves `apps/admin-ui/dist/` for `admin.example.com` and `apps/app/dist/` for tenant hosts (per-host root or shared root with same `dist`).
- Hono `serveStatic` from `@hono/node-server/serve-static` is the fallback if you want server-side routing context; not the default.

```caddyfile
*.app.example.com, {$CUSTOM_HOST_CNAME_TARGET} {
    tls { dns cloudflare {env.CLOUDFLARE_DNS_TOKEN}; on_demand }
    @api path /api/*
    handle @api { reverse_proxy apps-server:3000 }
    handle { root * /srv/app; try_files {path} /index.html; file_server }
}
```

## `packages/ui` (new, shadcn CLI v4 monorepo)

```
packages/ui/
├── components.json                    # shadcn config
├── package.json                       # name: "@workspace/ui"
├── styles/
│   └── globals.css                    # @import "tailwindcss"; @theme {...}
├── src/
│   ├── components/
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── form/
│   │   └── ... (Radix-backed primitives)
│   ├── hooks/
│   ├── lib/utils.ts                   # `cn` helper
│   └── index.ts
├── tsconfig.json
└── vitest.config.ts
```

Init: `pnpm dlx shadcn@latest init --monorepo` (or `bunx shadcn@latest init --monorepo`). Apps import via `import { Button } from "@workspace/ui/components/button"`.

Tailwind v4 monorepo pattern: **NO JS preset**. Each app's `app/globals.css` imports from `packages/ui/styles/globals.css` and adds app-specific tokens with `@theme`. Source: https://tailwindcss.com/docs/theme

## Per-tenant branding (decision **ND8**)

### Schema

`organization.branding jsonb` shape:
```ts
type Branding = {
  logoVersion: number;        // bumped on each upload; client uses for cache-busting
  primaryColor: string;       // hex; CSS-variable injected
  appName: string;            // overrides default
};
```

No `logoExt` — uploads are re-encoded to **WebP** server-side via `sharp@0.34.5`. Resolves worker plan open question #3.

### Upload flow

`POST /api/tenancy/branding/logo` (multipart):
1. Auth: tenant member with `branding.update` permission.
2. Size cap: 2 MB.
3. Allowed MIME: `image/png`, `image/jpeg`, `image/webp`, `image/svg+xml`.
4. SVG: sanitize via DOMPurify-equivalent (server-side `isomorphic-dompurify` or hand-rolled allowlist) before passthrough.
5. Raster: `sharp(input).resize({ width: 512, height: 512, fit: "contain", background: { r:0,g:0,b:0,alpha:0 } }).webp({ quality: 90 })`.
6. S3 PUT to `branding-assets/${organizationId}/logo.${logoVersion + 1}.webp` via `@aws-sdk/lib-storage` `Upload` class.
7. `UPDATE organizations SET branding = jsonb_set(branding, '{logoVersion}', to_jsonb(${newVersion}))` + audit, then after commit `hatchet.events.push("tenancy.invalidate", { host: tenant.host })`.

Source: https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html · https://sharp.pixelplumbing.com/

### Storage backend (env-pluggable)

```env
S3_ENDPOINT=http://rustfs:9000          # dev
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
S3_BUCKET_BRANDING=branding-assets
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

| Environment | Backend | Notes |
|---|---|---|
| Local dev | **RustFS** | Alpha but adequate for dev. Drop-in MinIO binary compat. https://github.com/rustfs/rustfs |
| Production default | **SeaweedFS** | Apache 2.0, billion-file scale, S3+POSIX+WebDAV. https://github.com/seaweedfs/seaweedfs |
| Cloud | AWS S3 / GCS / Cloudflare R2 / Backblaze B2 | Plug via env. |
| Excluded | MinIO | Repo archived Feb 2026. |

### Public read serving

Branding URLs: `https://branding.example.com/${organizationId}/logo.${version}.webp`. Caddy proxies `branding.example.com` directly to the S3 endpoint (`reverse_proxy seaweedfs-s3:8333` with `header_up Host {http.reverse_proxy.upstream.hostport}`), or signs URLs and proxies through `apps/server` for private buckets.

CSP `img-src` allowlist includes `branding.example.com`.

## `/api/tenancy/current` final shape (D78 port)

```ts
// GET /api/tenancy/current → 200
{
  organizationId: "org_...",
  slug: "acme" | null,                      // null for custom-host tenants
  host: "acme.app.example.com" | "app.acme.com",
  kind: "subdomain" | "custom",
  enforceSSO: boolean,
  branding: { logoVersion: number, primaryColor: string, appName: string },
  logoUrl: "https://branding.example.com/${organizationId}/logo.${version}.webp" | null,
}
```

## Typed API clients (B7 port)

Each web app has its own generated typed client from the OpenAPI spec exported by its server process:

- `apps/server` exports `/api/openapi.json` via `@hono/zod-openapi` 1.3.0 `app.doc(...)`.
- `apps/admin-server` exports its own under `/api/openapi.json`.
- Turbo task `generate-openapi` runs in each server app; `generate-client` in each web app depends on `^generate-openapi`.
- `@hey-api/openapi-ts` config:
  ```ts
  // apps/app/openapi-ts.config.ts
  export default {
    input: "../server/dist/openapi.json",
    output: "src/api",
    plugins: [
      "@tanstack/react-query",       // generates useQuery/useMutation hooks
      "zod",                          // generates Zod schemas
    ],
  };
  ```

## Storybook

`packages/ui/.storybook/`:
- Storybook 10.x with Vite framework.
- `@tailwindcss/vite` plugin in `vite.config.ts`.
- `preview.ts` imports `../styles/globals.css`.
- Vitest integration via `@storybook/addon-vitest` (NOT `@storybook/test-runner`). Source: https://storybook.js.org/docs/writing-tests/integrations/vitest-addon

## Sources

(All inline above.) Verified against current 2026 docs as of 2026-05-11.
