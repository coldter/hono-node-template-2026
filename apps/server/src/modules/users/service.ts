import { firstOrThrow } from "@repo/db";
import { accounts, sessions, users } from "@repo/db/schema";
import {
  and,
  arrayContains,
  count,
  eq,
  ilike,
  or,
  type SQL,
} from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

import { db, type Executor } from "@/db";
import type { AuditContext } from "@/lib/audit-context";
import { AUDIT_EVENTS, TARGET_TYPES } from "@/modules/audit-logs/constants";
import { auditLogService } from "@/modules/audit-logs/service";
import type { AuditLogMetadata } from "@/modules/audit-logs/types";
import { hashPassword } from "@/modules/auth/helpers/argon2id";
import {
  buildOrderBy,
  createPaginatedResponse,
  getPaginationParams,
} from "@/utils/pagination";

import { USER_STATUS, USERS_SORT_COLUMNS } from "./constants";
import { UserNotFoundError } from "./errors";
import { createChangeMetadata } from "./helpers";
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UpdateUserRolesInput,
  UserRecord,
} from "./types";
import { onUserStatusChange } from "./user-status-hooks";

export const userService = {
  async activate(
    id: string,
    actorId: string,
    auditContext: AuditContext,
    executor: Executor = db
  ): Promise<void> {
    let previousStatus: string = USER_STATUS.ACTIVE;

    await executor.transaction(async (tx) => {
      const [existing] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existing) {
        throw new UserNotFoundError(id);
      }
      previousStatus = existing.status;
      const updatedUsers = await tx
        .update(users)
        .set({
          deactivatedAt: null,
          deactivatedBy: null,
          deactivatedReason: null,
          status: USER_STATUS.ACTIVE,
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });

      if (updatedUsers.length === 0) {
        throw new UserNotFoundError(id);
      }

      await auditLogService.create(
        {
          actorId,
          actorType: "user",
          event: AUDIT_EVENTS.USER.ACTIVATED.event,
          ipAddress: auditContext.ipAddress,
          targetId: id,
          targetType: TARGET_TYPES.USER,
          userAgent: auditContext.userAgent,
        },
        tx
      );
    });

    await onUserStatusChange(id, USER_STATUS.ACTIVE, previousStatus, null);
  },

  async create(
    input: CreateUserInput,
    actorId: string,
    auditContext: AuditContext,
    executor: Executor = db
  ): Promise<UserRecord> {
    const hashedPassword = await hashPassword(input.password);
    const email = input.email.trim().toLowerCase();

    return executor.transaction(async (tx) => {
      const user = firstOrThrow(
        await tx
          .insert(users)
          .values({
            email,
            emailVerified: false,
            failedLoginAttempts: 0,
            name: input.name,
            roleSlugs: input.roleSlugs,
            status: USER_STATUS.ACTIVE,
          })
          .returning(),
        "Failed to create user"
      );

      await tx.insert(accounts).values({
        accountId: user.id,
        password: hashedPassword,
        providerId: "credential",
        userId: user.id,
      });

      await auditLogService.create(
        {
          actorId,
          actorType: "user",
          event: AUDIT_EVENTS.USER.CREATED.event,
          ipAddress: auditContext.ipAddress,
          metadata: {
            email,
            name: input.name,
            roleSlugs: input.roleSlugs,
          },
          targetId: user.id,
          targetType: TARGET_TYPES.USER,
          userAgent: auditContext.userAgent,
        },
        tx
      );

      return user;
    });
  },

  async deactivate(
    id: string,
    reason: string | null,
    actorId: string,
    auditContext: AuditContext,
    executor: Executor = db
  ): Promise<void> {
    let previousStatus: string = USER_STATUS.ACTIVE;

    await executor.transaction(async (tx) => {
      const [existing] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existing) {
        throw new UserNotFoundError(id);
      }
      previousStatus = existing.status;
      const updatedUsers = await tx
        .update(users)
        .set({
          deactivatedAt: new Date(),
          deactivatedBy: actorId,
          deactivatedReason: reason,
          status: USER_STATUS.INACTIVE,
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });

      if (updatedUsers.length === 0) {
        throw new UserNotFoundError(id);
      }

      await tx.delete(sessions).where(eq(sessions.userId, id));

      await auditLogService.create(
        {
          actorId,
          actorType: "user",
          event: AUDIT_EVENTS.USER.DEACTIVATED.event,
          ipAddress: auditContext.ipAddress,
          metadata: { reason },
          targetId: id,
          targetType: TARGET_TYPES.USER,
          userAgent: auditContext.userAgent,
        },
        tx
      );
    });

    await onUserStatusChange(id, USER_STATUS.INACTIVE, previousStatus, reason);
  },
  async find(query: ListUsersQuery) {
    const { search, status, role } = query;
    const { perPage, offset, sort, order } = getPaginationParams(query);

    const conditions: SQL[] = [];

    if (search) {
      const searchPattern = `%${search}%`;
      const nameMatch = ilike(users.name, searchPattern);
      const emailMatch = ilike(users.email, searchPattern);
      const searchCondition = or(nameMatch, emailMatch);
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    if (status) {
      conditions.push(eq(users.status, status));
    }

    if (role) {
      conditions.push(arrayContains(users.roleSlugs, [role]));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const sortColumnMap = {
      [USERS_SORT_COLUMNS.name]: users.name,
      [USERS_SORT_COLUMNS.email]: users.email,
      [USERS_SORT_COLUMNS.status]: users.status,
      [USERS_SORT_COLUMNS.createdAt]: users.createdAt,
      [USERS_SORT_COLUMNS.updatedAt]: users.updatedAt,
    };

    const [data, [countResult]] = await Promise.all([
      db
        .select({
          createdAt: users.createdAt,
          email: users.email,
          emailVerified: users.emailVerified,
          id: users.id,
          image: users.image,
          name: users.name,
          roleSlugs: users.roleSlugs,
          status: users.status,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(where)
        .orderBy(buildOrderBy(sortColumnMap, sort, order, users.createdAt))
        .limit(perPage)
        .offset(offset),
      db.select({ total: count() }).from(users).where(where),
    ]);

    return createPaginatedResponse({
      data,
      query,
      total: countResult?.total ?? 0,
    });
  },

  async findAccountSummaryById(id: string) {
    const [user] = await db
      .select({
        createdAt: users.createdAt,
        email: users.email,
        emailVerified: users.emailVerified,
        id: users.id,
        image: users.image,
        name: users.name,
        onboardingCompletedAt: users.onboardingCompletedAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  },

  async findAuthSubjectById(id: string) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  },

  async findById(id: string): Promise<UserRecord | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  },

  async findDetailById(id: string) {
    const [user] = await db
      .select({
        createdAt: users.createdAt,
        deactivatedAt: users.deactivatedAt,
        deactivatedBy: users.deactivatedBy,
        deactivatedReason: users.deactivatedReason,
        email: users.email,
        emailVerified: users.emailVerified,
        failedLoginAttempts: users.failedLoginAttempts,
        id: users.id,
        image: users.image,
        lockedUntil: users.lockedUntil,
        name: users.name,
        roleSlugs: users.roleSlugs,
        status: users.status,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  },

  async unlock(
    id: string,
    actorId: string,
    auditContext: AuditContext,
    executor: Executor = db
  ): Promise<void> {
    let previousStatus: string = USER_STATUS.ACTIVE;

    await executor.transaction(async (tx) => {
      const [existing] = await tx
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existing) {
        throw new UserNotFoundError(id);
      }
      previousStatus = existing.status;
      const updatedUsers = await tx
        .update(users)
        .set({
          failedLoginAttempts: 0,
          lockedUntil: null,
          status: USER_STATUS.ACTIVE,
        })
        .where(eq(users.id, id))
        .returning({ id: users.id });

      if (updatedUsers.length === 0) {
        throw new UserNotFoundError(id);
      }

      await auditLogService.create(
        {
          actorId,
          actorType: "user",
          event: AUDIT_EVENTS.USER.UNLOCKED.event,
          ipAddress: auditContext.ipAddress,
          targetId: id,
          targetType: TARGET_TYPES.USER,
          userAgent: auditContext.userAgent,
        },
        tx
      );
    });

    await onUserStatusChange(id, USER_STATUS.ACTIVE, previousStatus, null);
  },

  async update(
    id: string,
    input: UpdateUserInput,
    actorId: string,
    auditContext: AuditContext,
    executor: Executor = db
  ): Promise<UserRecord> {
    return executor.transaction(async (tx) => {
      const [existing] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existing) {
        throw new UserNotFoundError(id);
      }

      const updatedUser = firstOrThrow(
        await tx
          .update(users)
          .set({
            ...(input.name !== undefined && { name: input.name }),
          })
          .where(eq(users.id, id))
          .returning({
            createdAt: users.createdAt,
            deactivatedAt: users.deactivatedAt,
            deactivatedBy: users.deactivatedBy,
            deactivatedReason: users.deactivatedReason,
            email: users.email,
            emailVerified: users.emailVerified,
            failedLoginAttempts: users.failedLoginAttempts,
            id: users.id,
            image: users.image,
            lockedUntil: users.lockedUntil,
            name: users.name,
            roleSlugs: users.roleSlugs,
            status: users.status,
            updatedAt: users.updatedAt,
          }),
        "Failed to update user"
      );

      const metadata = createChangeMetadata({ name: existing.name }, input, [
        "name",
      ]);

      if (metadata.changedFields && metadata.changedFields.length > 0) {
        await auditLogService.create(
          {
            actorId,
            actorType: "user",
            event: AUDIT_EVENTS.USER.UPDATED.event,
            ipAddress: auditContext.ipAddress,
            metadata,
            targetId: id,
            targetType: TARGET_TYPES.USER,
            userAgent: auditContext.userAgent,
          },
          tx
        );
      }

      return updatedUser;
    });
  },

  async updateRoles(
    id: string,
    input: UpdateUserRolesInput,
    actorId: string,
    auditContext: AuditContext,
    executor: Executor = db
  ): Promise<UserRecord> {
    if (id === actorId) {
      throw new HTTPException(403, { message: "Forbidden" });
    }

    return executor.transaction(async (tx) => {
      const [existing] = await tx
        .select({ roleSlugs: users.roleSlugs })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!existing) {
        throw new UserNotFoundError(id);
      }

      const updatedUser = firstOrThrow(
        await tx
          .update(users)
          .set({ roleSlugs: input.roleSlugs })
          .where(eq(users.id, id))
          .returning({
            createdAt: users.createdAt,
            deactivatedAt: users.deactivatedAt,
            deactivatedBy: users.deactivatedBy,
            deactivatedReason: users.deactivatedReason,
            email: users.email,
            emailVerified: users.emailVerified,
            failedLoginAttempts: users.failedLoginAttempts,
            id: users.id,
            image: users.image,
            lockedUntil: users.lockedUntil,
            name: users.name,
            roleSlugs: users.roleSlugs,
            status: users.status,
            updatedAt: users.updatedAt,
          }),
        "Failed to update user roles"
      );

      const metadata: AuditLogMetadata = {
        changedFields: ["roleSlugs"],
        changes: {
          roleSlugs: {
            from: existing.roleSlugs,
            to: input.roleSlugs,
          },
        },
      };

      await auditLogService.create(
        {
          actorId,
          actorType: "user",
          event: AUDIT_EVENTS.ROLE.ASSIGNED.event,
          ipAddress: auditContext.ipAddress,
          metadata,
          targetId: id,
          targetType: TARGET_TYPES.USER,
          userAgent: auditContext.userAgent,
        },
        tx
      );

      return updatedUser;
    });
  },
};
