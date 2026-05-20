import {
  type DrizzleClient,
  firstOrThrow,
  generatePrefixedCuid,
  ID_PREFIXES,
  liveOrganizations,
  type Transaction,
} from "@repo/db";
import {
  auditLogs,
  organizations,
  reservedSlugs,
  sessions,
} from "@repo/db/schema";
import type { ActorType } from "@repo/shared/audit";
import type { Invalidator } from "@repo/tenancy";
import { eq, sql } from "drizzle-orm";
import { LifecycleError } from "./lifecycle-error";
import { assertArrow, type TransitionTable } from "./transition-table";

export type OrganizationLifecycleErrorCode =
  | "invalid_transition"
  | "not_found"
  | "duplicate_slug";

export class OrganizationLifecycleError extends LifecycleError<OrganizationLifecycleErrorCode> {
  constructor(code: OrganizationLifecycleErrorCode, message?: string) {
    super(code, message);
    this.name = "OrganizationLifecycleError";
  }
}

export type OrgState = "active" | "suspended" | "soft_deleted";

// suspended → soft_deleted is forbidden; callers must restore first so soft-delete always runs from active
export const TRANSITIONS: TransitionTable<OrgState> = {
  active: new Set(["suspended", "soft_deleted"]),
  suspended: new Set(["active"]),
  soft_deleted: new Set(),
};

export type Actor = Readonly<{
  type: ActorType;
  id: string;
}>;

export type CreateData = Readonly<{
  slug: string;
  name: string;
  enforceSSO?: boolean;
}>;

export type Transition =
  | {
      kind: "create";
      data: CreateData;
      actor: Actor;
      host: string;
    }
  | {
      kind: "suspend";
      orgId: string;
      actor: Actor;
      host: string;
    }
  | {
      kind: "restore";
      orgId: string;
      actor: Actor;
      host: string;
    }
  | {
      kind: "softDelete";
      orgId: string;
      actor: Actor;
      host: string;
    };

export type LifecycleDeps = Readonly<{
  db: DrizzleClient;
  invalidator: Invalidator;
}>;

export type CreateResult = Readonly<{
  id: string;
  slug: string;
  name: string;
}>;

// loaded via liveOrganizations seam so tombstoned rows are filtered — prevents resurrection
type LiveOrgSnapshot = Readonly<{
  id: string;
  suspendedAt: Date | null;
  deletedAt: Date | null;
  sessionVersion: number;
  slug: string | null;
}>;

async function loadLive(
  tx: Transaction,
  orgId: string
): Promise<LiveOrgSnapshot> {
  return await firstOrThrow(
    liveOrganizations(tx).selectById(
      {
        id: organizations.id,
        suspendedAt: organizations.suspendedAt,
        deletedAt: organizations.deletedAt,
        sessionVersion: organizations.sessionVersion,
        slug: organizations.slug,
      },
      orgId
    ),
    () => new OrganizationLifecycleError("not_found")
  );
}

function currentState(snapshot: LiveOrgSnapshot): OrgState {
  if (snapshot.deletedAt) {
    return "soft_deleted";
  }
  if (snapshot.suspendedAt) {
    return "suspended";
  }
  return "active";
}

function assertOrgArrow(from: OrgState, to: OrgState): void {
  assertArrow(TRANSITIONS, from, to, OrganizationLifecycleError);
}

// sessionVersion is forward-only (never decremented on restore); bumpDurable runs in-tx, broadcast is post-commit best-effort
export async function applyOrgTransition(
  transition: Transition,
  deps: LifecycleDeps,
  now: Date = new Date()
): Promise<CreateResult | null> {
  let createdOut: CreateResult | null = null;

  await deps.db.transaction(async (tx) => {
    switch (transition.kind) {
      case "create": {
        const id = generatePrefixedCuid(ID_PREFIXES.organization);
        const { slug, name, enforceSSO } = transition.data;
        const row = await firstOrThrow(
          tx
            .insert(organizations)
            .values({
              id,
              slug,
              name,
              enforceSSO: enforceSSO ?? false,
              sessionVersion: 0,
            })
            .returning({
              id: organizations.id,
              slug: organizations.slug,
              name: organizations.name,
            }),
          () => new OrganizationLifecycleError("not_found")
        );
        await tx.insert(auditLogs).values({
          event: "tenancy.org.created",
          actorId: transition.actor.id,
          actorType: transition.actor.type,
          targetId: row.id,
          targetType: "organization",
          organizationId: row.id,
          metadata: { slug: row.slug, name: row.name, host: transition.host },
        });
        await deps.invalidator.bumpDurable(tx);
        createdOut = { id: row.id, slug: row.slug ?? slug, name: row.name };
        break;
      }
      case "suspend": {
        const snap = await loadLive(tx, transition.orgId);
        assertOrgArrow(currentState(snap), "suspended");
        await tx
          .update(organizations)
          .set({
            suspendedAt: now,
            sessionVersion: sql`${organizations.sessionVersion} + 1`,
          })
          .where(eq(organizations.id, snap.id));
        await tx
          .delete(sessions)
          .where(eq(sessions.activeOrganizationId, snap.id));
        await tx.insert(auditLogs).values({
          event: "tenancy.org.suspended",
          actorId: transition.actor.id,
          actorType: transition.actor.type,
          targetId: snap.id,
          targetType: "organization",
          organizationId: snap.id,
          metadata: { host: transition.host },
        });
        await tx.insert(auditLogs).values({
          event: "tenancy.user.session_revoked_mass",
          actorId: transition.actor.id,
          actorType: transition.actor.type,
          targetId: snap.id,
          targetType: "organization",
          organizationId: snap.id,
          metadata: {
            host: transition.host,
            reason: "org_suspended",
            previousSessionVersion: snap.sessionVersion,
          },
        });
        await deps.invalidator.bumpDurable(tx);
        break;
      }
      case "restore": {
        const snap = await loadLive(tx, transition.orgId);
        assertOrgArrow(currentState(snap), "active");
        await tx
          .update(organizations)
          .set({ suspendedAt: null })
          .where(eq(organizations.id, snap.id));
        await tx.insert(auditLogs).values({
          event: "tenancy.org.restored",
          actorId: transition.actor.id,
          actorType: transition.actor.type,
          targetId: snap.id,
          targetType: "organization",
          organizationId: snap.id,
          metadata: {
            host: transition.host,
            sessionVersion: snap.sessionVersion,
          },
        });
        await deps.invalidator.bumpDurable(tx);
        break;
      }
      case "softDelete": {
        const snap = await loadLive(tx, transition.orgId);
        assertOrgArrow(currentState(snap), "soft_deleted");
        await tx
          .update(organizations)
          .set({ deletedAt: now })
          .where(eq(organizations.id, snap.id));
        if (snap.slug) {
          // tombstone in reserved_slugs blocks a fresh create from reclaiming the slug after soft-delete
          await tx
            .insert(reservedSlugs)
            .values({
              slug: snap.slug,
              reason: "tombstone",
              organizationId: snap.id,
            })
            .onConflictDoNothing();
        }
        await tx
          .delete(sessions)
          .where(eq(sessions.activeOrganizationId, snap.id));
        await tx.insert(auditLogs).values({
          event: "tenancy.org.softDeleted",
          actorId: transition.actor.id,
          actorType: transition.actor.type,
          targetId: snap.id,
          targetType: "organization",
          organizationId: snap.id,
          metadata: { host: transition.host, slug: snap.slug },
        });
        await deps.invalidator.bumpDurable(tx);
        break;
      }
      default: {
        const _exhaustive: never = transition;
        throw new Error(`unreachable: ${String(_exhaustive)}`);
      }
    }
  });

  await deps.invalidator.broadcast(transition.host);
  return createdOut;
}

export function createTenant(
  args: Readonly<{ data: CreateData; actor: Actor; host: string }>,
  deps: LifecycleDeps,
  now?: Date
): Promise<CreateResult | null> {
  return applyOrgTransition(
    { kind: "create", data: args.data, actor: args.actor, host: args.host },
    deps,
    now
  );
}

export function suspendTenant(
  args: Readonly<{ orgId: string; actor: Actor; host: string }>,
  deps: LifecycleDeps,
  now?: Date
): Promise<CreateResult | null> {
  return applyOrgTransition(
    { kind: "suspend", orgId: args.orgId, actor: args.actor, host: args.host },
    deps,
    now
  );
}

export function restoreTenant(
  args: Readonly<{ orgId: string; actor: Actor; host: string }>,
  deps: LifecycleDeps,
  now?: Date
): Promise<CreateResult | null> {
  return applyOrgTransition(
    { kind: "restore", orgId: args.orgId, actor: args.actor, host: args.host },
    deps,
    now
  );
}

export function softDeleteTenant(
  args: Readonly<{ orgId: string; actor: Actor; host: string }>,
  deps: LifecycleDeps,
  now?: Date
): Promise<CreateResult | null> {
  return applyOrgTransition(
    {
      kind: "softDelete",
      orgId: args.orgId,
      actor: args.actor,
      host: args.host,
    },
    deps,
    now
  );
}
