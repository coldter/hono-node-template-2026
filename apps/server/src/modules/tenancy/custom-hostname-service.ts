import type { DrizzleClient } from "@repo/db";
import { tenantCustomHostnames } from "@repo/db/schema";
import type { Invalidator } from "@repo/tenancy";
import { and, eq, gt, sql } from "drizzle-orm";
import { firstOrThrow } from "@/db";
import {
  CustomHostnameError,
  type CustomHostnameErrorCode,
} from "./custom-hostname-errors";
import { resolveTxt as defaultResolveTxt } from "./doh-resolver";
import {
  applyTransition,
  generateVerificationToken,
  runTxtVerification,
} from "./lifecycle";

export type CustomHostnameServiceDeps = Readonly<{
  db: DrizzleClient;
  resolveTxt?: (name: string) => Promise<string[][]>;
  txtLabel: string;
  invalidator: Invalidator;
}>;

export type CustomHostnameService = ReturnType<typeof customHostnameService>;

const MAX_PENDING_PER_ORG = 10;
const MAX_REQUESTS_PER_24H = 50;

const LABEL_RE = /^[a-z0-9](-?[a-z0-9])*$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export type HostnameValidationFailure =
  | "too_long"
  | "too_short"
  | "has_uppercase"
  | "contains_protocol"
  | "contains_path"
  | "invalid_label"
  | "reserved_localhost"
  | "ip_literal"
  | "reserved_apex";

export function validateHostnameShape(
  raw: string,
  options: { appWildcardHost: string }
):
  | { ok: true; hostname: string }
  | { ok: false; reason: HostnameValidationFailure } {
  if (raw !== raw.toLowerCase()) {
    return { ok: false, reason: "has_uppercase" };
  }
  if (raw.includes("://")) {
    return { ok: false, reason: "contains_protocol" };
  }
  if (raw.includes("/")) {
    return { ok: false, reason: "contains_path" };
  }
  if (raw.length === 0) {
    return { ok: false, reason: "too_short" };
  }
  if (raw.length > 253) {
    return { ok: false, reason: "too_long" };
  }
  if (IPV4_RE.test(raw)) {
    return { ok: false, reason: "ip_literal" };
  }

  const labels = raw.split(".");
  if (labels.length < 2) {
    return { ok: false, reason: "invalid_label" };
  }

  for (const label of labels) {
    if (label.length === 0 || label.length > 63) {
      return { ok: false, reason: "invalid_label" };
    }
    if (!LABEL_RE.test(label)) {
      return { ok: false, reason: "invalid_label" };
    }
  }

  const lowerWildcard = options.appWildcardHost.toLowerCase();
  if (raw === lowerWildcard || raw.endsWith(`.${lowerWildcard}`)) {
    return { ok: false, reason: "reserved_apex" };
  }

  if (raw === "localhost" || raw.endsWith(".localhost")) {
    return { ok: false, reason: "reserved_localhost" };
  }

  return { ok: true, hostname: raw };
}

export function customHostnameService(deps: CustomHostnameServiceDeps) {
  const resolveTxt = deps.resolveTxt ?? defaultResolveTxt;

  async function request(input: {
    orgId: string;
    hostname: string;
    appWildcardHost: string;
  }): Promise<{ row: typeof tenantCustomHostnames.$inferSelect }> {
    const validation = validateHostnameShape(input.hostname, {
      appWildcardHost: input.appWildcardHost,
    });
    if (!validation.ok) {
      throw new CustomHostnameError(
        "invalid_hostname",
        `Invalid hostname: ${validation.reason}`
      );
    }

    const pending = await deps.db
      .select({ id: tenantCustomHostnames.id })
      .from(tenantCustomHostnames)
      .where(
        and(
          eq(tenantCustomHostnames.organizationId, input.orgId),
          eq(tenantCustomHostnames.lifecycleStatus, "pending_txt")
        )
      );
    if (pending.length >= MAX_PENDING_PER_ORG) {
      throw new CustomHostnameError("max_pending");
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await deps.db
      .select({ id: tenantCustomHostnames.id })
      .from(tenantCustomHostnames)
      .where(
        and(
          eq(tenantCustomHostnames.organizationId, input.orgId),
          gt(tenantCustomHostnames.createdAt, since)
        )
      );
    if (recent.length >= MAX_REQUESTS_PER_24H) {
      throw new CustomHostnameError("rate_limit_24h");
    }

    const token = generateVerificationToken();
    try {
      const row = await firstOrThrow(
        deps.db
          .insert(tenantCustomHostnames)
          .values({
            organizationId: input.orgId,
            hostname: validation.hostname,
            verificationToken: token,
          })
          .returning(),
        "invariant: insert into tenant_custom_hostnames returned no row"
      );
      return { row };
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new CustomHostnameError("duplicate_hostname");
      }
      throw e;
    }
  }

  async function verifyTxt(input: {
    id: string;
    orgId: string;
  }): Promise<typeof tenantCustomHostnames.$inferSelect> {
    const row = await loadOwnedRow(input);

    const result = await runTxtVerification(row, {
      resolveTxt,
      txtLabel: deps.txtLabel,
    });
    if (!result.ok) {
      throw new CustomHostnameError(mapVerificationReason(result.reason));
    }

    const now = new Date();
    const out = await applyTransition(
      row,
      {
        kind: "transition",
        next: "awaiting_caddy",
        verificationVerifiedAt: now,
      },
      { db: deps.db, invalidator: deps.invalidator },
      now
    );
    return out.row;
  }

  async function list(
    orgId: string
  ): Promise<(typeof tenantCustomHostnames.$inferSelect)[]> {
    return await deps.db
      .select()
      .from(tenantCustomHostnames)
      .where(eq(tenantCustomHostnames.organizationId, orgId))
      .orderBy(sql`${tenantCustomHostnames.createdAt} desc`);
  }

  async function remove(input: {
    id: string;
    orgId: string;
  }): Promise<typeof tenantCustomHostnames.$inferSelect> {
    const row = await loadOwnedRow(input);
    const out = await applyTransition(
      row,
      { kind: "transition", next: "removing" },
      { db: deps.db, invalidator: deps.invalidator }
    );
    return out.row;
  }

  async function loadOwnedRow(input: {
    id: string;
    orgId: string;
  }): Promise<typeof tenantCustomHostnames.$inferSelect> {
    const rows = await deps.db
      .select()
      .from(tenantCustomHostnames)
      .where(
        and(
          eq(tenantCustomHostnames.id, input.id),
          eq(tenantCustomHostnames.organizationId, input.orgId)
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new CustomHostnameError("not_found");
    }
    return row;
  }

  return { request, verifyTxt, list, remove } as const;
}

function mapVerificationReason(
  reason: "no_record" | "mismatch" | "resolver_error"
): CustomHostnameErrorCode {
  if (reason === "no_record") {
    return "verify_no_record";
  }
  if (reason === "mismatch") {
    return "verify_mismatch";
  }
  return "verify_resolver_error";
}

// boundary: drizzle's `DrizzleQueryError` wraps `pg.DatabaseError` loosely; we narrow with typeof guards before reading `.code` / `.cause.code`.
function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) {
    return false;
  }
  const obj = e as { code?: unknown; cause?: unknown };
  if (typeof obj.code === "string" && obj.code === "23505") {
    return true;
  }
  if (typeof obj.cause === "object" && obj.cause !== null) {
    const cause = obj.cause as { code?: unknown };
    if (typeof cause.code === "string" && cause.code === "23505") {
      return true;
    }
  }
  return false;
}
