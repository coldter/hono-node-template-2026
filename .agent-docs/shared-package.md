# Shared Package (`@repo/shared`)

Use explicit subpath imports and treat shared runtime constants as source of truth.

## Stable Modules
- `@repo/shared/authorization`
- `@repo/shared/roles`
- `@repo/shared/pagination`
- `@repo/shared/audit`
- `@repo/shared/users`
- `@repo/shared/brand`

## Usage Rules
- Reuse shared authorization/role constants across server and web; do not duplicate strings.
- Derive types from runtime constants (`as const`) instead of writing separate duplicated unions.
- Use shared pagination schemas/helpers for list endpoints and list UIs.
- `@repo/shared/users` is the canonical home for `USER_STATUS`, `USER_STATUS_VALUES`, `userStatusSchema`, `UserStatus`, and `USER_STATUS_CONFIG`. Re-export from these - never redefine the enum locally.
