import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

/**
 * Drizzle Relations v2 - centralized relations definition.
 * @see https://orm.drizzle.team/docs/relations-v1-v2
 */
export const relations = defineRelations(schema, (r) => ({
  accounts: {
    user: r.one.users({
      from: r.accounts.userId,
      to: r.users.id,
    }),
  },
  auditLogs: {
    actor: r.one.users({
      from: r.auditLogs.actorId,
      optional: true,
      to: r.users.id,
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
  members: {
    organization: r.one.organizations({
      from: r.members.organizationId,
      to: r.organizations.id,
    }),
    user: r.one.users({
      from: r.members.userId,
      to: r.users.id,
    }),
  },
  notificationPreferences: {
    user: r.one.users({
      from: r.notificationPreferences.userId,
      to: r.users.id,
    }),
  },
  notifications: {
    user: r.one.users({
      from: r.notifications.userId,
      to: r.users.id,
    }),
  },
  organizations: {
    invitations: r.many.invitations({
      from: r.organizations.id,
      to: r.invitations.organizationId,
    }),
    members: r.many.members({
      from: r.organizations.id,
      to: r.members.organizationId,
    }),
  },
  pushTokens: {
    user: r.one.users({
      from: r.pushTokens.userId,
      to: r.users.id,
    }),
  },
  sessions: {
    user: r.one.users({
      from: r.sessions.userId,
      to: r.users.id,
    }),
  },
  users: {
    accounts: r.many.accounts({
      from: r.users.id,
      to: r.accounts.userId,
    }),
    auditLogs: r.many.auditLogs({
      from: r.users.id,
      to: r.auditLogs.actorId,
    }),
    deactivatedByUser: r.one.users({
      from: r.users.deactivatedBy,
      to: r.users.id,
    }),
    members: r.many.members({
      from: r.users.id,
      to: r.members.userId,
    }),
    notificationPreferences: r.many.notificationPreferences({
      from: r.users.id,
      to: r.notificationPreferences.userId,
    }),
    notifications: r.many.notifications({
      from: r.users.id,
      to: r.notifications.userId,
    }),
    pushTokens: r.many.pushTokens({
      from: r.users.id,
      to: r.pushTokens.userId,
    }),
    sessions: r.many.sessions({
      from: r.users.id,
      to: r.sessions.userId,
    }),
  },
}));
