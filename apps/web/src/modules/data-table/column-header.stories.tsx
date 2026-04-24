import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTableColumnHeader } from "./column-header";

type Row = { name: string };

const rows: Row[] = [{ name: "Ada" }];

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    enableSorting: true,
  },
];

type HeaderHostProps = { title: string; canHide?: boolean };

function HeaderHost({ title, canHide = true }: HeaderHostProps) {
  const table = useReactTable({
    data: rows,
    columns: [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={title} />
        ),
        enableSorting: true,
        enableHiding: canHide,
      },
    ],
    getCoreRowModel: getCoreRowModel(),
  });
  const column = table.getColumn("name");
  if (!column) {
    throw new Error("expected column");
  }
  return <DataTableColumnHeader column={column} title={title} />;
}

const meta = {
  title: "Patterns/DataTable/Parts/ColumnHeader",
  component: HeaderHost,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Sortable column header with a dropdown menu (Asc/Desc/Hide). Used via `columns.header` in `ColumnDef`.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof HeaderHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: "Name" },
};

export const NonHideable: Story = {
  args: { title: "Actions", canHide: false },
};

export const NonSortable: Story = {
  args: { title: "Name (static)" },
  render: () => {
    const table = useReactTable({
      data: rows,
      columns: columns.map((c) => ({ ...c, enableSorting: false })),
      getCoreRowModel: getCoreRowModel(),
    });
    const column = table.getColumn("name");
    if (!column) {
      throw new Error("expected column");
    }
    return <DataTableColumnHeader column={column} title="Name (static)" />;
  },
};
