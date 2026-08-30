import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import type { DataTableFeatures } from "./features";
import { dataTableFeatures } from "./features";
import { DataTableViewOptions } from "./view-options";

type Row = {
  name: string;
  email: string;
  status: string;
  role: string;
  createdAt: string;
};

const rows: Row[] = [
  {
    createdAt: "2024-01-01",
    email: "ada@example.com",
    name: "Ada",
    role: "admin",
    status: "active",
  },
];

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "role", header: "Role" },
  { accessorKey: "createdAt", header: "Created" },
];

function ViewOptionsHost() {
  const table = useTable({
    columns,
    data: rows,
    features: dataTableFeatures,
  });
  return (
    <div className="flex justify-end">
      <DataTableViewOptions table={table} />
    </div>
  );
}

const meta = {
  component: ViewOptionsHost,
  parameters: {
    docs: {
      description: {
        component:
          "Dropdown to toggle column visibility. Hidden on small screens; lives at the end of `DataTableToolbar`.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Patterns/DataTable/Parts/ViewOptions",
} satisfies Meta<typeof ViewOptionsHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
