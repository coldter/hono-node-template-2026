import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTablePagination } from "./pagination";

type Row = { id: number };

const makeRows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1 }));

const columns: ColumnDef<Row>[] = [{ accessorKey: "id", header: "ID" }];

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
  const table = useReactTable({
    data: makeRows(rowCount),
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize, pageIndex } },
  });

  return (
    <div className="@container/content">
      <DataTablePagination table={table} />
    </div>
  );
}

const meta = {
  title: "Patterns/DataTable/Parts/Pagination",
  component: PaginationHost,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Pagination control: page-size selector, jump-to-first/last, prev/next, and numbered buttons (with ellipsis for many pages).",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof PaginationHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { rowCount: 100, pageSize: 10, pageIndex: 1 },
};

export const FirstPage: Story = {
  args: { rowCount: 100, pageSize: 10, pageIndex: 0 },
};

export const LastPage: Story = {
  args: { rowCount: 100, pageSize: 10, pageIndex: 9 },
};

export const SinglePage: Story = {
  args: { rowCount: 5, pageSize: 10, pageIndex: 0 },
};
