import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import type { ListAuditLogsResponse } from "@/api.gen/types.gen";
import { DataTableColumnHeader } from "@/modules/data-table/column-header";
import { Badge } from "@/modules/ui/badge";

export type AuditLog = ListAuditLogsResponse["data"][number];

const eventBadgeVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  "auth.login.success": "default",
  "auth.login.failed": "destructive",
  "auth.logout": "secondary",
  "user.created": "default",
  "user.deleted": "destructive",
};

export const auditLogsColumns: ColumnDef<AuditLog>[] = [
  {
    accessorKey: "event",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Event" />
    ),
    cell: ({ row }) => {
      const event = row.getValue<string>("event");
      const variant = eventBadgeVariants[event] ?? "outline";
      return <Badge variant={variant}>{event}</Badge>;
    },
    enableSorting: true,
  },
  {
    accessorKey: "actorType",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actor Type" />
    ),
    cell: ({ row }) => {
      const actorType = row.getValue<string>("actorType");
      return <span className="capitalize">{actorType}</span>;
    },
    enableSorting: true,
  },
  {
    accessorKey: "actorId",
    header: "Actor ID",
    cell: ({ row }) => {
      const actorId = row.getValue<string | null>("actorId");
      return actorId ? (
        <code className="text-xs">{actorId.slice(0, 8)}...</code>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
  {
    accessorKey: "targetType",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Target Type" />
    ),
    cell: ({ row }) => {
      const targetType = row.getValue<string | null>("targetType");
      return targetType ? (
        <span className="capitalize">{targetType}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "ipAddress",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="IP Address" />
    ),
    cell: ({ row }) => {
      const ip = row.getValue<string | null>("ipAddress");
      return ip ?? <span className="text-muted-foreground">-</span>;
    },
    enableSorting: true,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Date" />
    ),
    cell: ({ row }) => {
      const date = row.getValue<string>("createdAt");
      return format(new Date(date), "MMM dd, yyyy HH:mm");
    },
    enableSorting: true,
  },
];
