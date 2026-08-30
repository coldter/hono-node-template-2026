import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { format } from "date-fns";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { DataTableColumnHeader } from "@/modules/data-table/column-header";
import { DataTable } from "@/modules/data-table/data-table";
import type { DataTableFeatures } from "@/modules/data-table/features";
import { dataTableFeatures } from "@/modules/data-table/features";
import { DataTablePagination } from "@/modules/data-table/pagination";
import { DataTableToolbar } from "@/modules/data-table/toolbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";
import { UserRoleBadges } from "../components/user-role-badges";
import { UserStatusBadge } from "../components/user-status-badge";
import type { User, UserStatus } from "../types";

const mockUsersColumns: ColumnDef<DataTableFeatures, User>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => {
      const user = row.original;
      const initials = user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage alt={user.name} src={user.image ?? undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{user.name}</span>
            <span className="text-muted-foreground text-sm">{user.email}</span>
          </div>
        </div>
      );
    },
    enableSorting: true,
    filterFn: (row, _id, value: string) => {
      const user = row.original;
      const needle = value.toLowerCase();
      return (
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle)
      );
    },
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="User" />
    ),
  },
  {
    accessorKey: "status",
    cell: ({ row }) => (
      <UserStatusBadge status={row.original.status as UserStatus} />
    ),
    enableSorting: true,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
  },
  {
    accessorKey: "roleSlugs",
    cell: ({ row }) => <UserRoleBadges roles={row.original.roleSlugs} />,
    enableSorting: false,
    header: "Roles",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {format(new Date(row.getValue<string>("createdAt")), "MMM dd, yyyy")}
      </span>
    ),
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
  },
];

const mockUsers: User[] = [
  {
    createdAt: "2024-01-02T00:00:00.000Z",
    email: "ada@example.com",
    emailVerified: true,
    id: "u_1",
    image: null,
    name: "Ada Lovelace",
    roleSlugs: ["admin"],
    status: "active",
    updatedAt: "2024-01-02T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-05T00:00:00.000Z",
    email: "alan@example.com",
    emailVerified: true,
    id: "u_2",
    image: null,
    name: "Alan Turing",
    roleSlugs: ["admin", "editor"],
    status: "active",
    updatedAt: "2024-01-05T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-08T00:00:00.000Z",
    email: "grace@example.com",
    emailVerified: true,
    id: "u_3",
    image: null,
    name: "Grace Hopper",
    roleSlugs: ["editor"],
    status: "active",
    updatedAt: "2024-01-08T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-10T00:00:00.000Z",
    email: "linus@example.com",
    emailVerified: false,
    id: "u_4",
    image: null,
    name: "Linus Torvalds",
    roleSlugs: ["editor"],
    status: "inactive",
    updatedAt: "2024-01-10T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-11T00:00:00.000Z",
    email: "margaret@example.com",
    emailVerified: true,
    id: "u_5",
    image: null,
    name: "Margaret Hamilton",
    roleSlugs: ["viewer"],
    status: "active",
    updatedAt: "2024-01-11T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-12T00:00:00.000Z",
    email: "donald@example.com",
    emailVerified: true,
    id: "u_6",
    image: null,
    name: "Donald Knuth",
    roleSlugs: ["viewer", "editor", "auditor"],
    status: "active",
    updatedAt: "2024-01-12T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-15T00:00:00.000Z",
    email: "ken@example.com",
    emailVerified: true,
    id: "u_7",
    image: null,
    name: "Ken Thompson",
    roleSlugs: ["admin"],
    status: "locked",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-17T00:00:00.000Z",
    email: "dennis@example.com",
    emailVerified: true,
    id: "u_8",
    image: null,
    name: "Dennis Ritchie",
    roleSlugs: ["editor"],
    status: "active",
    updatedAt: "2024-01-17T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-19T00:00:00.000Z",
    email: "barbara@example.com",
    emailVerified: true,
    id: "u_9",
    image: null,
    name: "Barbara Liskov",
    roleSlugs: ["viewer"],
    status: "inactive",
    updatedAt: "2024-01-19T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-21T00:00:00.000Z",
    email: "edsger@example.com",
    emailVerified: true,
    id: "u_10",
    image: null,
    name: "Edsger Dijkstra",
    roleSlugs: ["admin"],
    status: "active",
    updatedAt: "2024-01-21T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-22T00:00:00.000Z",
    email: "brian@example.com",
    emailVerified: true,
    id: "u_11",
    image: null,
    name: "Brian Kernighan",
    roleSlugs: ["editor"],
    status: "active",
    updatedAt: "2024-01-22T00:00:00.000Z",
  },
  {
    createdAt: "2024-01-23T00:00:00.000Z",
    email: "john@example.com",
    emailVerified: true,
    id: "u_12",
    image: null,
    name: "John McCarthy",
    roleSlugs: ["viewer"],
    status: "locked",
    updatedAt: "2024-01-23T00:00:00.000Z",
  },
];

const statusOptions = [
  { icon: CheckCircle2, label: "Active", value: "active" },
  { icon: Circle, label: "Inactive", value: "inactive" },
  { icon: Lock, label: "Locked", value: "locked" },
];

type UsersTableStoryProps = {
  data: User[];
  isLoading?: boolean;
  isError?: boolean;
};

function UsersTableStory({ data, isLoading, isError }: UsersTableStoryProps) {
  const table = useTable({
    columns: mockUsersColumns,
    data,
    features: dataTableFeatures,
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
  });

  return (
    <div className="@container/content space-y-4">
      <DataTableToolbar
        filters={[
          { columnId: "status", options: statusOptions, title: "Status" },
        ]}
        searchKey="name"
        searchPlaceholder="Search users..."
        table={table}
      />
      <DataTable
        columns={mockUsersColumns}
        data={data}
        emptyMessage="No users found."
        isError={isError}
        isLoading={isLoading}
        table={table}
      />
      <DataTablePagination table={table} />
    </div>
  );
}

const meta = {
  component: UsersTableStory,
  parameters: {
    docs: {
      description: {
        component:
          "Feature-level composition for the users list. Mirrors the production `UsersTable` but uses mock columns (dropping the `<Link>` to user detail) and local table state instead of `useTableUrlState` and `useUsersQuery`.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Features/Users/UsersTable",
} satisfies Meta<typeof UsersTableStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: mockUsers } };

export const Loading: Story = { args: { data: [], isLoading: true } };

export const Errored: Story = { args: { data: [], isError: true } };

export const Empty: Story = { args: { data: [] } };
