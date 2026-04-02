import { auditLogs, users } from "@repo/db/schema";
import { db } from "@/db";

export const isUserSeeded = async () => {
  const usersInTable = await db.select().from(users).limit(1);
  return usersInTable.length > 0;
};

export const isAuditLogsSeeded = async () => {
  const logsInTable = await db.select().from(auditLogs).limit(1);
  return logsInTable.length > 0;
};
