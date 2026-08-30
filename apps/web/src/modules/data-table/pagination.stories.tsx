import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ColumnDef, useTable } from "@tanstack/react-table";
import type { DataTableFeatures } from "./features";
import { dataTableFeatures } from "./features";
import { DataTablePagination } from "./pagination";

type Row = { id: number };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1 }));

const columns: ColumnDef<DataTableFeatures, Row>[] = [
  { accessorKey: "id", header: "ID" },
];

type PaginationHostProps = {
  rowCount: number;
  pageSize: number;
  pageIndex: number;
};

function PaginationHost({
  rowCount,
  pageSize,
  pageIndex,
}: PaginationHostProps) {
  const table = useTable({
    columns,
    data: makeRows(rowCount),
    features: dataTableFeatures,
    initialState: { pagination: { pageIndex, pageSize } },
  });

  return (
    <div className="@container/content">
      <DataTablePagination table={table} />
    </div>
  );
}

const meta = {
  component: PaginationHost,
  parameters: {
    docs: {
      description: {
        component:
          "Pagination control: page-size selector, jump-to-first/last, prev/next, and numbered buttons (with ellipsis for many pages).",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Patterns/DataTable/Parts/Pagination",
} satisfies Meta<typeof PaginationHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { pageIndex: 1, pageSize: 10, rowCount: 100 },
};

export const FirstPage: Story = {
  args: { pageIndex: 0, pageSize: 10, rowCount: 100 },
};

export const LastPage: Story = {
  args: { pageIndex: 9, pageSize: 10, rowCount: 100 },
};

export const SinglePage: Story = {
  args: { pageIndex: 0, pageSize: 10, rowCount: 5 },
};
