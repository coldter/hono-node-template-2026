# @repo/shared

Shared runtime primitives and Zod schemas used by the server, web app, database package, and email templates.

## Subpath exports

- `@repo/shared/audit` — canonical audit event catalog (`AUDIT_EVENTS`), actor/target types, and metadata types. `@repo/db` and the server derive their audit types and event keys from here.
- `@repo/shared/authorization` — authorization schema, resource registry, and principal builders built on `@repo/authorization`.
- `@repo/shared/brand` — brand defaults and `getBrandConfig`.
- `@repo/shared/pagination` — pagination query/meta schemas plus `getPaginationParams` and `createPaginatedResponse`.
- `@repo/shared/roles` — system role definitions.
- `@repo/shared/users` — user status values and related user constants.

## Pagination conventions

`getPaginationParams` clamps `page` and `perPage` to positive integers and caps `perPage` at `PAGINATION_DEFAULTS.MAX_PER_PAGE`, falling back to defaults for non-finite input.

`createPaginatedResponse` treats the database `total` as authoritative: even when a formatter drops rows from the returned page, `meta.total` and `meta.pageCount` describe the full result set.

## Scripts

- `bun run test`
- `bun run check-types`
