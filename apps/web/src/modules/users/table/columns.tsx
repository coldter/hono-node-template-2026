import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";

import { DataTableColumnHeader } from "@/modules/data-table/column-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";

import { UserRoleBadges } from "../components/user-role-badges";
import { UserStatusBadge } from "../components/user-status-badge";
import type { User, UserStatus } from "../types";

export const usersColumns: ColumnDef<User>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="User" />
    ),
    cell: ({ row }) => {
      const user = row.original;
      const initials = user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      return (
        <Link
          className="flex items-center gap-3 transition-colors hover:text-primary"
          params={{ userId: user.id }}
          to="/users/$userId"
        >
          <Avatar className="h-9 w-9">
            <AvatarImage alt={user.name} src={user.image ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{user.name}</span>
            <span className="text-muted-foreground text-sm">{user.email}</span>
          </div>
        </Link>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <UserStatusBadge status={row.original.status as UserStatus} />
    ),
    enableSorting: true,
  },
  {
    accessorKey: "roleSlugs",
    header: "Roles",
    cell: ({ row }) => <UserRoleBadges roles={row.original.roleSlugs} />,
    enableSorting: false,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const date = row.getValue<string>("createdAt");
      return (
        <span className="text-muted-foreground">
          {format(new Date(date), "MMM dd, yyyy")}
        </span>
      );
    },
    enableSorting: true,
  },
];
