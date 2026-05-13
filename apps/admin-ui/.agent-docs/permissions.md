# Permissions

## Permission Systems
- String permissions: route protection, nav visibility, simple UI guards.
- CASL abilities: resource-level checks for specific entities/actions.

## Rules
- Keep permission constants centralized in the permissions module.
- Wrap trees that use CASL hooks/components with `AbilityProvider`.
- Keep data ownership filtering on the server; frontend permission checks are presentation guards.
