import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import { DataTableColumnHeader } from "./column-header";
import type { DataTableFeatures } from "./features";
import { dataTableFeatures } from "./features";

type Row = { name: string };

const rows: Row[] = [{ name: "Ada" }];

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  {
    accessorKey: "name",
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
];

type HeaderHostProps = { title: string; canHide?: boolean };

function HeaderHost({ title, canHide = true }: HeaderHostProps) {
  const table = useTable({
    columns: [
      {
        accessorKey: "name",
        enableHiding: canHide,
        enableSorting: true,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={title} />
        ),
      },
    ],
    data: rows,
    features: dataTableFeatures,
  });
  const column = table.getColumn("name");
  if (!column) {
    throw new Error("expected column");
  }
  return <DataTableColumnHeader column={column} title={title} />;
}

const meta = {
  component: HeaderHost,
  parameters: {
    docs: {
      description: {
        component:
          "Sortable column header with a dropdown menu (Asc/Desc/Hide). Used via `columns.header` in `ColumnDef`.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Patterns/DataTable/Parts/ColumnHeader",
} satisfies Meta<typeof HeaderHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: "Name" },
};

export const NonHideable: Story = {
  args: { canHide: false, title: "Actions" },
};

export const NonSortable: Story = {
  args: { title: "Name (static)" },
  render: () => {
    const table = useTable({
      columns: columns.map((c) => ({ ...c, enableSorting: false })),
      data: rows,
      features: dataTableFeatures,
    });
    const column = table.getColumn("name");
    if (!column) {
      throw new Error("expected column");
    }
    return <DataTableColumnHeader column={column} title="Name (static)" />;
  },
};
