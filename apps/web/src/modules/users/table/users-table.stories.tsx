import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type ColumnDef,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { format } from "date-fns";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { DataTableColumnHeader } from "@/modules/data-table/column-header";
import { DataTable } from "@/modules/data-table/data-table";
import { DataTablePagination } from "@/modules/data-table/pagination";
import { DataTableToolbar } from "@/modules/data-table/toolbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/modules/ui/avatar";
import { UserRoleBadges } from "../components/user-role-badges";
import { UserStatusBadge } from "../components/user-status-badge";
import type { User, UserStatus } from "../types";

// Local mock columns mirror `usersColumns` but swap `<Link>` for a plain
// element so the story renders without a TanStack Router context.
const mockUsersColumns: ColumnDef<User>[] = [
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
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => (
      <UserStatusBadge status={row.original.status as UserStatus} />
    ),
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
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
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {format(new Date(row.getValue<string>("createdAt")), "MMM dd, yyyy")}
      </span>
    ),
    enableSorting: true,
  },
];

const mockUsers: User[] = [
  {
    id: "u_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["admin"],
    createdAt: "2024-01-02T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  },
  {
    id: "u_2",
    name: "Alan Turing",
    email: "alan@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["admin", "editor"],
    createdAt: "2024-01-05T00:00:00.000Z",
    updatedAt: "2024-01-05T00:00:00.000Z",
  },
  {
    id: "u_3",
    name: "Grace Hopper",
    email: "grace@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["editor"],
    createdAt: "2024-01-08T00:00:00.000Z",
    updatedAt: "2024-01-08T00:00:00.000Z",
  },
  {
    id: "u_4",
    name: "Linus Torvalds",
    email: "linus@example.com",
    emailVerified: false,
    image: null,
    status: "inactive",
    roleSlugs: ["editor"],
    createdAt: "2024-01-10T00:00:00.000Z",
    updatedAt: "2024-01-10T00:00:00.000Z",
  },
  {
    id: "u_5",
    name: "Margaret Hamilton",
    email: "margaret@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["viewer"],
    createdAt: "2024-01-11T00:00:00.000Z",
    updatedAt: "2024-01-11T00:00:00.000Z",
  },
  {
    id: "u_6",
    name: "Donald Knuth",
    email: "donald@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["viewer", "editor", "auditor"],
    createdAt: "2024-01-12T00:00:00.000Z",
    updatedAt: "2024-01-12T00:00:00.000Z",
  },
  {
    id: "u_7",
    name: "Ken Thompson",
    email: "ken@example.com",
    emailVerified: true,
    image: null,
    status: "locked",
    roleSlugs: ["admin"],
    createdAt: "2024-01-15T00:00:00.000Z",
    updatedAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "u_8",
    name: "Dennis Ritchie",
    email: "dennis@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["editor"],
    createdAt: "2024-01-17T00:00:00.000Z",
    updatedAt: "2024-01-17T00:00:00.000Z",
  },
  {
    id: "u_9",
    name: "Barbara Liskov",
    email: "barbara@example.com",
    emailVerified: true,
    image: null,
    status: "inactive",
    roleSlugs: ["viewer"],
    createdAt: "2024-01-19T00:00:00.000Z",
    updatedAt: "2024-01-19T00:00:00.000Z",
  },
  {
    id: "u_10",
    name: "Edsger Dijkstra",
    email: "edsger@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["admin"],
    createdAt: "2024-01-21T00:00:00.000Z",
    updatedAt: "2024-01-21T00:00:00.000Z",
  },
  {
    id: "u_11",
    name: "Brian Kernighan",
    email: "brian@example.com",
    emailVerified: true,
    image: null,
    status: "active",
    roleSlugs: ["editor"],
    createdAt: "2024-01-22T00:00:00.000Z",
    updatedAt: "2024-01-22T00:00:00.000Z",
  },
  {
    id: "u_12",
    name: "John McCarthy",
    email: "john@example.com",
    emailVerified: true,
    image: null,
    status: "locked",
    roleSlugs: ["viewer"],
    createdAt: "2024-01-23T00:00:00.000Z",
    updatedAt: "2024-01-23T00:00:00.000Z",
  },
];

const statusOptions = [
  { label: "Active", value: "active", icon: CheckCircle2 },
  { label: "Inactive", value: "inactive", icon: Circle },
  { label: "Locked", value: "locked", icon: Lock },
];

type UsersTableStoryProps = {
  data: User[];
  isLoading?: boolean;
  isError?: boolean;
};

function UsersTableStory({ data, isLoading, isError }: UsersTableStoryProps) {
  const table = useReactTable({
    data,
    columns: mockUsersColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 5, pageIndex: 0 } },
  });

  return (
    <div className="@container/content space-y-4">
      <DataTableToolbar
        filters={[
          { columnId: "status", title: "Status", options: statusOptions },
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
  title: "Features/Users/UsersTable",
  component: UsersTableStory,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Feature-level composition for the users list. Mirrors the production `UsersTable` but uses mock columns (dropping the `<Link>` to user detail) and local table state instead of `useTableUrlState` and `useUsersQuery`.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof UsersTableStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: mockUsers } };

export const Loading: Story = { args: { data: [], isLoading: true } };

export const Errored: Story = { args: { data: [], isError: true } };

export const Empty: Story = { args: { data: [] } };
