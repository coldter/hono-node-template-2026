# Audit Logs Module

Immutable audit trail for security-sensitive actions.

## Essentials
- Do not update or delete audit records.
- Capture actor, target, and request context (`ipAddress`, `userAgent`) for traceability.
- Write audit entries in the same transaction as the action they describe.
