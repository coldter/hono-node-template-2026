import { accounts, sessions, users } from "@repo/db/schema";
import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { AUDIT_EVENTS, TARGET_TYPES } from "@/modules/audit-logs/constants";
import { auditLogService } from "@/modules/audit-logs/service";
import type { AuditLogMetadata } from "@/modules/audit-logs/types";
import { hashPassword } from "@/modules/auth/helpers/argon2id";
import {
  createPaginatedResponse,
  getPaginationParams,
} from "@/utils/pagination";

import { USER_STATUS, USERS_SORT_COLUMNS } from "./constants";
import { createChangeMetadata } from "./helpers";
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UpdateUserRolesInput,
  UserRecord,
} from "./types";

export const userService = {
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
    const sortColumn =
      sortColumnMap[sort as keyof typeof sortColumnMap] ?? users.createdAt;
    const orderFn = order === "asc" ? asc : desc;

    const [data, [countResult]] = await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          emailVerified: users.emailVerified,
          image: users.image,
          status: users.status,
          roleSlugs: users.roleSlugs,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(where)
        .orderBy(orderFn(sortColumn))
        .limit(perPage)
        .offset(offset),
      db.select({ total: count() }).from(users).where(where),
    ]);

    return createPaginatedResponse({
      data,
      total: countResult?.total ?? 0,
      query,
    });
  },

  async findById(id: string): Promise<UserRecord | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user ?? null;
  },

  async findAccountSummaryById(id: string) {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        image: users.image,
        onboardingCompletedAt: users.onboardingCompletedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return user ?? null;
  },

  async create(
    input: CreateUserInput,
    actorId: string,
    auditContext: { ipAddress?: string; userAgent?: string }
  ): Promise<UserRecord> {
    const hashedPassword = await hashPassword(input.password);

    return db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          emailVerified: false,
          status: USER_STATUS.ACTIVE,
          roleSlugs: input.roleSlugs,
          failedLoginAttempts: 0,
        })
        .returning();

      await tx.insert(accounts).values({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: hashedPassword,
      });

      await auditLogService.create(
        {
          event: AUDIT_EVENTS.USER.CREATED.event,
          actorId,
          actorType: "user",
          targetId: user.id,
          targetType: TARGET_TYPES.USER,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: {
            name: input.name,
            email: input.email,
            roleSlugs: input.roleSlugs,
          },
        },
        tx
      );

      return user;
    });
  },

  async update(
    id: string,
    input: UpdateUserInput,
    actorId: string,
    auditContext: { ipAddress?: string; userAgent?: string }
  ): Promise<UserRecord> {
    const existingUser = await this.findById(id);
    if (!existingUser) {
      throw new Error("User not found");
    }

    return db.transaction(async (tx) => {
      const [updatedUser] = await tx
        .update(users)
        .set({
          ...(input.name && { name: input.name }),
          ...(input.email && { email: input.email }),
        })
        .where(eq(users.id, id))
        .returning();

      const metadata = createChangeMetadata(
        { name: existingUser.name, email: existingUser.email },
        input,
        ["name", "email"]
      );

      if (metadata.changedFields && metadata.changedFields.length > 0) {
        await auditLogService.create(
          {
            event: AUDIT_EVENTS.USER.UPDATED.event,
            actorId,
            actorType: "user",
            targetId: id,
            targetType: TARGET_TYPES.USER,
            ipAddress: auditContext.ipAddress,
            userAgent: auditContext.userAgent,
            metadata,
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
    auditContext: { ipAddress?: string; userAgent?: string }
  ): Promise<UserRecord> {
    const existingUser = await this.findById(id);
    if (!existingUser) {
      throw new Error("User not found");
    }

    return db.transaction(async (tx) => {
      const [updatedUser] = await tx
        .update(users)
        .set({ roleSlugs: input.roleSlugs })
        .where(eq(users.id, id))
        .returning();

      const metadata: AuditLogMetadata = {
        changes: {
          roleSlugs: {
            from: existingUser.roleSlugs,
            to: input.roleSlugs,
          },
        },
        changedFields: ["roleSlugs"],
      };

      await auditLogService.create(
        {
          event: AUDIT_EVENTS.ROLE.ASSIGNED.event,
          actorId,
          actorType: "user",
          targetId: id,
          targetType: TARGET_TYPES.USER,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata,
        },
        tx
      );

      return updatedUser;
    });
  },

  async deactivate(
    id: string,
    reason: string | null,
    actorId: string,
    auditContext: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: USER_STATUS.INACTIVE,
          deactivatedAt: new Date(),
          deactivatedBy: actorId,
          deactivatedReason: reason,
        })
        .where(eq(users.id, id));

      await tx.delete(sessions).where(eq(sessions.userId, id));

      await auditLogService.create(
        {
          event: AUDIT_EVENTS.USER.DEACTIVATED.event,
          actorId,
          actorType: "user",
          targetId: id,
          targetType: TARGET_TYPES.USER,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
          metadata: { reason },
        },
        tx
      );
    });
  },

  async activate(
    id: string,
    actorId: string,
    auditContext: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: USER_STATUS.ACTIVE,
          deactivatedAt: null,
          deactivatedBy: null,
          deactivatedReason: null,
        })
        .where(eq(users.id, id));

      await auditLogService.create(
        {
          event: AUDIT_EVENTS.USER.ACTIVATED.event,
          actorId,
          actorType: "user",
          targetId: id,
          targetType: TARGET_TYPES.USER,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
        },
        tx
      );
    });
  },

  async unlock(
    id: string,
    actorId: string,
    auditContext: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          status: USER_STATUS.ACTIVE,
          lockedUntil: null,
          failedLoginAttempts: 0,
        })
        .where(eq(users.id, id));

      await auditLogService.create(
        {
          event: AUDIT_EVENTS.USER.UNLOCKED.event,
          actorId,
          actorType: "user",
          targetId: id,
          targetType: TARGET_TYPES.USER,
          ipAddress: auditContext.ipAddress,
          userAgent: auditContext.userAgent,
        },
        tx
      );
    });
  },
};
