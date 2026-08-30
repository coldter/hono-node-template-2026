import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import type { DataTableFeatures } from "./features";
import { dataTableFeatures } from "./features";
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

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  { accessorKey: "name", header: "Name" },
  {
    accessorKey: "status",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    header: "Status",
  },
];

const statusOptions = [
  { icon: CheckCircle2, label: "Active", value: "active" },
  { icon: Circle, label: "Inactive", value: "inactive" },
  { icon: Lock, label: "Locked", value: "locked" },
];

type ToolbarHostProps = {
  searchKey?: string;
  withFilters: boolean;
};

function ToolbarHost({ searchKey, withFilters }: ToolbarHostProps) {
  const table = useTable({
    columns,
    data: rows,
    features: dataTableFeatures,
  });
  return (
    <DataTableToolbar
      filters={
        withFilters
          ? [{ columnId: "status", options: statusOptions, title: "Status" }]
          : []
      }
      searchKey={searchKey}
      searchPlaceholder="Search name..."
      table={table}
    />
  );
}

const meta = {
  component: ToolbarHost,
  parameters: {
    docs: {
      description: {
        component:
          "Top toolbar for a data table: search input (column or global), faceted filters, reset button, and view options. Placed above `DataTable`.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Patterns/DataTable/Parts/Toolbar",
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
