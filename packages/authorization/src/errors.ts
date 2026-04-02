import type { DenyReason } from "./types";

export class AuthorizationError extends Error {
  readonly reason: DenyReason;
  readonly matchedPolicy?: string;

  constructor(reason: DenyReason, matchedPolicy?: string) {
    super(`Authorization denied: ${reason}`);
    this.name = "AuthorizationError";
    this.reason = reason;
    this.matchedPolicy = matchedPolicy;
  }
}
