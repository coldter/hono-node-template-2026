import { faker } from "@faker-js/faker";
import { auditLogs, users } from "@repo/db/schema";
import chalk from "chalk";

import { db } from "@/db";
import { env } from "@/env";
import { ACTOR_TYPES, AUDIT_EVENTS } from "@/modules/audit-logs/constants";
import type {
  ActorType,
  AuditEventKey,
  AuditLogMetadata,
  TargetType,
} from "@/modules/audit-logs/types";

const SEED_COUNT = 200;

faker.seed(42);

const ALL_EVENTS: AuditEventKey[] = Object.values(AUDIT_EVENTS)
  .flatMap((group) => Object.values(group))
  .map((e) => e.event);

const ACTOR_TYPE_LIST: ActorType[] = Object.values(ACTOR_TYPES);

const getTargetTypeForEvent = (event: AuditEventKey): TargetType | null => {
  if (event.startsWith("user.")) {
    return "user";
  }
  if (event.startsWith("role.")) {
    return "role";
  }
  if (event.startsWith("auth.session")) {
    return "session";
  }
  if (event.startsWith("auth.")) {
    return "user";
  }
  return null;
};

const generateMetadata = (event: AuditEventKey): AuditLogMetadata | null => {
  if (event === "user.updated") {
    return {
      changedFields: ["name", "email"],
      changes: {
        email: { from: faker.internet.email(), to: faker.internet.email() },
        name: { from: faker.person.fullName(), to: faker.person.fullName() },
      },
    };
  }
  if (event === "auth.login.failed") {
    return {
      attempts: faker.number.int({ max: 5, min: 1 }),
      reason: faker.helpers.arrayElement([
        "invalid_password",
        "account_locked",
        "invalid_email",
      ]),
    };
  }
  if (event === "role.assigned" || event === "role.unassigned") {
    return {
      role: faker.helpers.arrayElement([
        "admin",
        "user",
        "moderator",
        "viewer",
      ]),
    };
  }
  return null;
};

export const auditLogsSeed = async () => {
  if (env.NODE_ENV === "production") {
    console.error("Not allowed in production.");
    return;
  }

  const existing = await db.select().from(auditLogs).limit(1);
  if (existing.length > 0) {
    console.warn("Audit logs table is not empty - skipping seed");
    return;
  }

  const existingUsers = await db.select({ id: users.id }).from(users);
  const userIds = existingUsers.map((u) => u.id);

  if (userIds.length === 0) {
    console.warn("No users found - run user seed first. Using null actor IDs.");
  }

  console.info(`Seeding ${SEED_COUNT} audit log entries...`);

  const entries = Array.from({ length: SEED_COUNT }, () => {
    const event = faker.helpers.arrayElement(ALL_EVENTS);
    const actorType = faker.helpers.arrayElement(ACTOR_TYPE_LIST);
    const targetType = getTargetTypeForEvent(event);

    return {
      actorId:
        actorType === "user" && userIds.length > 0
          ? faker.helpers.arrayElement(userIds)
          : null,
      actorType,
      createdAt: faker.date.recent({ days: 30 }),
      event,
      id: faker.string.uuid(),
      ipAddress: faker.internet.ipv4(),
      metadata: generateMetadata(event),
      targetId: targetType ? faker.string.uuid() : null,
      targetType,
      userAgent: faker.internet.userAgent(),
    };
  });

  entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  await db.insert(auditLogs).values(entries);

  console.info(
    `\n${chalk.greenBright.bold(SEED_COUNT)} audit log entries created.`
  );
  console.info(`  Events: ${chalk.cyan(ALL_EVENTS.length)} types`);
  console.info(`  Date range: ${chalk.cyan("Last 30 days")}`);
  console.info(`  Seed: ${chalk.cyan("42")} (reproducible)\n`);
};
