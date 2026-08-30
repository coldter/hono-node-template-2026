import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { DataTableFacetedFilter } from "./faceted-filter";
import type { DataTableFeatures } from "./features";
import { dataTableFeatures } from "./features";

type Row = { status: "active" | "inactive" | "locked" };

const rows: Row[] = [
  { status: "active" },
  { status: "active" },
  { status: "active" },
  { status: "inactive" },
  { status: "locked" },
];

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  {
    accessorKey: "status",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
];

const options = [
  { icon: CheckCircle2, label: "Active", value: "active" },
  { icon: Circle, label: "Inactive", value: "inactive" },
  { icon: Lock, label: "Locked", value: "locked" },
];

type FilterHostProps = { title: string };

function FilterHost({ title }: FilterHostProps) {
  const table = useTable({
    columns,
    data: rows,
    features: dataTableFeatures,
  });
  return (
    <DataTableFacetedFilter
      column={table.getColumn("status")}
      options={options}
      title={title}
    />
  );
}

const meta = {
  component: FilterHost,
  parameters: {
    docs: {
      description: {
        component:
          "Multi-select filter popover with facet counts, used inside `DataTableToolbar.filters`.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Patterns/DataTable/Parts/FacetedFilter",
} satisfies Meta<typeof FilterHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { title: "Status" } };
