import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
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
    name: "Ada",
    email: "ada@example.com",
    status: "active",
    role: "admin",
    createdAt: "2024-01-01",
  },
];

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "role", header: "Role" },
  { accessorKey: "createdAt", header: "Created" },
];

function ViewOptionsHost() {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div className="flex justify-end">
      <DataTableViewOptions table={table} />
    </div>
  );
}

const meta = {
  title: "Patterns/DataTable/Parts/ViewOptions",
  component: ViewOptionsHost,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Dropdown to toggle column visibility. Hidden on small screens; lives at the end of `DataTableToolbar`.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ViewOptionsHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
