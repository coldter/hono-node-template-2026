// DataTable compound pattern (canonical for this repo):
// - All tables follow this composition:
//     <DataTableToolbar>  ->  <DataTable>  ->  <DataTablePagination>
// - Sortable columns use `DataTableColumnHeader`.
// - Real features wire URL state via `useTableUrlState`; stories bypass that
//   and use plain local `useReactTable` state.
// - Feature stories live under `Features/<Feature>/...` so they never pollute
//   the `UI/` or `Patterns/` namespaces.
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
import { CheckCircle2, Circle, Lock, Shield, User } from "lucide-react";
import { Badge } from "@/modules/ui/badge";
import { DataTableColumnHeader } from "./column-header";
import { DataTable } from "./data-table";
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
    id: "1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    status: "active",
    role: "admin",
    createdAt: "2024-01-02",
  },
  {
    id: "2",
    name: "Alan Turing",
    email: "alan@example.com",
    status: "active",
    role: "admin",
    createdAt: "2024-01-05",
  },
  {
    id: "3",
    name: "Grace Hopper",
    email: "grace@example.com",
    status: "active",
    role: "editor",
    createdAt: "2024-01-08",
  },
  {
    id: "4",
    name: "Linus Torvalds",
    email: "linus@example.com",
    status: "active",
    role: "editor",
    createdAt: "2024-01-10",
  },
  {
    id: "5",
    name: "Margaret Hamilton",
    email: "margaret@example.com",
    status: "inactive",
    role: "viewer",
    createdAt: "2024-01-11",
  },
  {
    id: "6",
    name: "Donald Knuth",
    email: "donald@example.com",
    status: "active",
    role: "viewer",
    createdAt: "2024-01-12",
  },
  {
    id: "7",
    name: "Ken Thompson",
    email: "ken@example.com",
    status: "locked",
    role: "admin",
    createdAt: "2024-01-15",
  },
  {
    id: "8",
    name: "Dennis Ritchie",
    email: "dennis@example.com",
    status: "active",
    role: "editor",
    createdAt: "2024-01-17",
  },
  {
    id: "9",
    name: "Barbara Liskov",
    email: "barbara@example.com",
    status: "inactive",
    role: "viewer",
    createdAt: "2024-01-19",
  },
  {
    id: "10",
    name: "Edsger Dijkstra",
    email: "edsger@example.com",
    status: "active",
    role: "admin",
    createdAt: "2024-01-21",
  },
  {
    id: "11",
    name: "Brian Kernighan",
    email: "brian@example.com",
    status: "active",
    role: "editor",
    createdAt: "2024-01-22",
  },
  {
    id: "12",
    name: "John McCarthy",
    email: "john@example.com",
    status: "locked",
    role: "viewer",
    createdAt: "2024-01-23",
  },
];

const statusOptions = [
  { label: "Active", value: "active", icon: CheckCircle2 },
  { label: "Inactive", value: "inactive", icon: Circle },
  { label: "Locked", value: "locked", icon: Lock },
];

const roleOptions = [
  { label: "Admin", value: "admin", icon: Shield },
  { label: "Editor", value: "editor", icon: User },
  { label: "Viewer", value: "viewer", icon: User },
];

const columns: ColumnDef<MockRow>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.name}</span>
        <span className="text-muted-foreground text-xs">
          {row.original.email}
        </span>
      </div>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableSorting: true,
  },
  {
    accessorKey: "role",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Role" />
    ),
    cell: ({ row }) => <Badge variant="secondary">{row.original.role}</Badge>,
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    enableSorting: true,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {row.original.createdAt}
      </span>
    ),
    enableSorting: true,
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
  const allColumns: ColumnDef<MockRow>[] = extraColumns
    ? [
        ...columns,
        {
          id: "id",
          accessorKey: "id",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="ID" />
          ),
          cell: ({ row }) => (
            <code className="text-muted-foreground text-xs">
              {row.original.id}
            </code>
          ),
          enableSorting: true,
        },
        {
          id: "email",
          accessorKey: "email",
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Email" />
          ),
          cell: ({ row }) => (
            <span className="text-muted-foreground text-sm">
              {row.original.email}
            </span>
          ),
          enableSorting: true,
        },
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: allColumns,
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
        filters={
          withFilters
            ? [
                { columnId: "status", title: "Status", options: statusOptions },
                { columnId: "role", title: "Role", options: roleOptions },
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
  title: "Patterns/DataTable/Compound",
  component: TableComposition,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Canonical compound pattern for tables in this repo. Compose `DataTableToolbar` (search + faceted filters + view options), then `DataTable` (header/body with loading/error/empty slots), then `DataTablePagination`. Columns use `DataTableColumnHeader` for sortable headers. Production features (users, audit-logs) wire pagination/sorting to URL via `useTableUrlState`; stories skip that and use local table state so interactions work in isolation.",
      },
    },
  },
  tags: ["autodocs"],
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
