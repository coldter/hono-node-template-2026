import { db } from "@/db";
import { users } from "@/db/schema";
import { auditLogs } from "@/db/schema/audit-logs";

export const isUserSeeded = async () => {
  const usersInTable = await db.select().from(users).limit(1);
  return usersInTable.length > 0;
};

export const isAuditLogsSeeded = async () => {
  const logsInTable = await db.select().from(auditLogs).limit(1);
  return logsInTable.length > 0;
};
