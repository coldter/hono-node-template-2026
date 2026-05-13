import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type ColumnDef,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { DataTableToolbar } from "./toolbar";

type Row = {
  name: string;
  status: "active" | "inactive" | "locked";
};

const rows: Row[] = [
  { name: "Ada", status: "active" },
  { name: "Grace", status: "active" },
  { name: "Alan", status: "inactive" },
  { name: "Ken", status: "locked" },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
];

const statusOptions = [
  { label: "Active", value: "active", icon: CheckCircle2 },
  { label: "Inactive", value: "inactive", icon: Circle },
  { label: "Locked", value: "locked", icon: Lock },
];

type ToolbarHostProps = {
  searchKey?: string;
  withFilters: boolean;
};

function ToolbarHost({ searchKey, withFilters }: ToolbarHostProps) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });
  return (
    <DataTableToolbar
      filters={
        withFilters
          ? [{ columnId: "status", title: "Status", options: statusOptions }]
          : []
      }
      searchKey={searchKey}
      searchPlaceholder="Search name..."
      table={table}
    />
  );
}

const meta = {
  title: "Patterns/DataTable/Parts/Toolbar",
  component: ToolbarHost,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Top toolbar for a data table: search input (column or global), faceted filters, reset button, and view options. Placed above `DataTable`.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ToolbarHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { searchKey: "name", withFilters: false },
};

export const WithFilters: Story = {
  args: { searchKey: "name", withFilters: true },
};

export const GlobalSearch: Story = {
  args: { withFilters: false },
};
