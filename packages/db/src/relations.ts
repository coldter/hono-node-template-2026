import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Drizzle Relations v2 - Centralized relations definition
 *
 * All table relations are defined in one place using defineRelations.
 * @see https://orm.drizzle.team/docs/relations-v1-v2
 */
export const relations = defineRelations(schema, (r) => ({
  users: {
    deactivatedByUser: r.one.users({
      from: r.users.deactivatedBy,
      to: r.users.id,
    }),
    sessions: r.many.sessions({
      from: r.users.id,
      to: r.sessions.userId,
    }),
    accounts: r.many.accounts({
      from: r.users.id,
      to: r.accounts.userId,
    }),
    auditLogs: r.many.auditLogs({
      from: r.users.id,
      to: r.auditLogs.actorId,
    }),
    notifications: r.many.notifications({
      from: r.users.id,
      to: r.notifications.userId,
    }),
    notificationPreferences: r.many.notificationPreferences({
      from: r.users.id,
      to: r.notificationPreferences.userId,
    }),
    pushTokens: r.many.pushTokens({
      from: r.users.id,
      to: r.pushTokens.userId,
    }),
    members: r.many.members({
      from: r.users.id,
      to: r.members.userId,
    }),
  },
  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    }),
  },
  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    }),
  },
  auditLogs: {
    actor: r.one.users({
      from: r.auditLogs.actorId,
      to: r.users.id,
      optional: true,
    }),
  },
  notifications: {
    user: r.one.users({
      from: r.notifications.userId,
      to: r.users.id,
    }),
  },
  notificationPreferences: {
    user: r.one.users({
      from: r.notificationPreferences.userId,
      to: r.users.id,
    }),
  },
  pushTokens: {
    user: r.one.users({
      from: r.pushTokens.userId,
      to: r.users.id,
    }),
  },
  organizations: {
    members: r.many.members({
      from: r.organizations.id,
      to: r.members.organizationId,
    }),
    invitations: r.many.invitations({
      from: r.organizations.id,
      to: r.invitations.organizationId,
    }),
  },
  members: {
    user: r.one.users({
      from: r.members.userId,
      to: r.users.id,
    }),
    organization: r.one.organizations({
      from: r.members.organizationId,
      to: r.organizations.id,
    }),
  },
  invitations: {
    inviter: r.one.users({
      from: r.invitations.inviterId,
      to: r.users.id,
    }),
    organization: r.one.organizations({
      from: r.invitations.organizationId,
      to: r.organizations.id,
    }),
  },
}));
