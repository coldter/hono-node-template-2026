import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { CheckCircle2, Circle, Lock, Shield, User } from "lucide-react";
import { Badge } from "@/modules/ui/badge";
import { DataTableColumnHeader } from "./column-header";
import { DataTable } from "./data-table";
import type { DataTableFeatures } from "./features";
import { dataTableFeatures } from "./features";
import { DataTablePagination } from "./pagination";
import { DataTableToolbar } from "./toolbar";

type MockRow = {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive" | "locked";
  role: "admin" | "editor" | "viewer";
  createdAt: string;
};

const mockRows: MockRow[] = [
  {
    createdAt: "2024-01-02",
    email: "ada@example.com",
    id: "1",
    name: "Ada Lovelace",
    role: "admin",
    status: "active",
  },
  {
    createdAt: "2024-01-05",
    email: "alan@example.com",
    id: "2",
    name: "Alan Turing",
    role: "admin",
    status: "active",
  },
  {
    createdAt: "2024-01-08",
    email: "grace@example.com",
    id: "3",
    name: "Grace Hopper",
    role: "editor",
    status: "active",
  },
  {
    createdAt: "2024-01-10",
    email: "linus@example.com",
    id: "4",
    name: "Linus Torvalds",
    role: "editor",
    status: "active",
  },
  {
    createdAt: "2024-01-11",
    email: "margaret@example.com",
    id: "5",
    name: "Margaret Hamilton",
    role: "viewer",
    status: "inactive",
  },
  {
    createdAt: "2024-01-12",
    email: "donald@example.com",
    id: "6",
    name: "Donald Knuth",
    role: "viewer",
    status: "active",
  },
  {
    createdAt: "2024-01-15",
    email: "ken@example.com",
    id: "7",
    name: "Ken Thompson",
    role: "admin",
    status: "locked",
  },
  {
    createdAt: "2024-01-17",
    email: "dennis@example.com",
    id: "8",
    name: "Dennis Ritchie",
    role: "editor",
    status: "active",
  },
  {
    createdAt: "2024-01-19",
    email: "barbara@example.com",
    id: "9",
    name: "Barbara Liskov",
    role: "viewer",
    status: "inactive",
  },
  {
    createdAt: "2024-01-21",
    email: "edsger@example.com",
    id: "10",
    name: "Edsger Dijkstra",
    role: "admin",
    status: "active",
  },
  {
    createdAt: "2024-01-22",
    email: "brian@example.com",
    id: "11",
    name: "Brian Kernighan",
    role: "editor",
    status: "active",
  },
  {
    createdAt: "2024-01-23",
    email: "john@example.com",
    id: "12",
    name: "John McCarthy",
    role: "viewer",
    status: "locked",
  },
];

const statusOptions = [
  { icon: CheckCircle2, label: "Active", value: "active" },
  { icon: Circle, label: "Inactive", value: "inactive" },
  { icon: Lock, label: "Locked", value: "locked" },
];

const roleOptions = [
  { icon: Shield, label: "Admin", value: "admin" },
  { icon: User, label: "Editor", value: "editor" },
  { icon: User, label: "Viewer", value: "viewer" },
];

const columns: ColumnDef<DataTableFeatures, MockRow>[] = [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.name}</span>
        <span className="text-muted-foreground text-xs">
          {row.original.email}
        </span>
      </div>
    ),
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: "status",
    cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    enableSorting: true,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
  },
  {
    accessorKey: "role",
    cell: ({ row }) => <Badge variant="secondary">{row.original.role}</Badge>,
    enableSorting: true,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.createdAt}
      </span>
    ),
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
  },
];

type CompositionProps = {
  data: MockRow[];
  isLoading?: boolean;
  isError?: boolean;
  withFilters?: boolean;
  extraColumns?: boolean;
};

function TableComposition({
  data,
  isLoading,
  isError,
  withFilters,
  extraColumns,
}: CompositionProps) {
  const allColumns: ColumnDef<DataTableFeatures, MockRow>[] = extraColumns
    ? [
        ...columns,
        {
          accessorKey: "id",
          cell: ({ row }) => (
            <code className="text-muted-foreground text-xs">
              {row.original.id}
            </code>
          ),
          enableSorting: true,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="ID" />
          ),
          id: "id",
        },
        {
          accessorKey: "email",
          cell: ({ row }) => (
            <span className="text-muted-foreground text-sm">
              {row.original.email}
            </span>
          ),
          enableSorting: true,
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Email" />
          ),
          id: "email",
        },
      ]
    : columns;

  const table = useTable({
    columns: allColumns,
    data,
    features: dataTableFeatures,
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
  });

  return (
    <div className="@container/content space-y-4">
      <DataTableToolbar
        filters={
          withFilters
            ? [
                { columnId: "status", options: statusOptions, title: "Status" },
                { columnId: "role", options: roleOptions, title: "Role" },
              ]
            : []
        }
        searchKey="name"
        searchPlaceholder="Search name..."
        table={table}
      />
      <DataTable
        columns={allColumns}
        data={data}
        isError={isError}
        isLoading={isLoading}
        table={table}
      />
      <DataTablePagination table={table} />
    </div>
  );
}

const meta = {
  component: TableComposition,
  parameters: {
    docs: {
      description: {
        component:
          "Canonical compound pattern for tables in this repo. Compose `DataTableToolbar` (search + faceted filters + view options), then `DataTable` (header/body with loading/error/empty slots), then `DataTablePagination`. Columns use `DataTableColumnHeader` for sortable headers. Production features (users, audit-logs) wire pagination/sorting to URL via `useTableUrlState`; stories skip that and use local table state so interactions work in isolation.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Patterns/DataTable/Compound",
} satisfies Meta<typeof TableComposition>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: mockRows },
};

export const Loading: Story = {
  args: { data: [], isLoading: true },
};

export const Errored: Story = {
  args: { data: [], isError: true },
};

export const Empty: Story = {
  args: { data: [] },
};

export const WithFacetedFilters: Story = {
  args: { data: mockRows, withFilters: true },
};

export const ManyColumns: Story = {
  args: { data: mockRows, extraColumns: true },
};
