import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type ColumnDef,
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { DataTableFacetedFilter } from "./faceted-filter";

type Row = { status: "active" | "inactive" | "locked" };

const rows: Row[] = [
  { status: "active" },
  { status: "active" },
  { status: "active" },
  { status: "inactive" },
  { status: "locked" },
];

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "status",
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
];

const options = [
  { label: "Active", value: "active", icon: CheckCircle2 },
  { label: "Inactive", value: "inactive", icon: Circle },
  { label: "Locked", value: "locked", icon: Lock },
];

type FilterHostProps = { title: string };

function FilterHost({ title }: FilterHostProps) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
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
  title: "Patterns/DataTable/Parts/FacetedFilter",
  component: FilterHost,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Multi-select filter popover with facet counts, used inside `DataTableToolbar.filters`.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof FilterHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { title: "Status" } };
