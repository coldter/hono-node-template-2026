import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/ui/table";
import { TableEmpty } from "./table-empty";
import { TableError } from "./table-error";
import { TableSkeleton } from "./table-skeleton";
import type { DataTableProps } from "./types";

export function DataTable<TData>({
  columns,
  data,
  isLoading,
  isError,
  emptyMessage,
  table: tableFromProps,
  ...tableProps
}: DataTableProps<TData>) {
  const internalTable = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    ...tableProps,
  });

  const table = tableFromProps ?? internalTable;

  const renderContent = () => {
    if (isError) {
      return <TableError colSpan={columns.length} />;
    }

    if (isLoading) {
      return <TableSkeleton columnCount={columns.length} />;
    }

    const rows = table.getRowModel().rows;
    if (rows.length === 0) {
      return <TableEmpty colSpan={columns.length} message={emptyMessage} />;
    }

    return rows.map((row) => (
      <TableRow data-state={row.getIsSelected() && "selected"} key={row.id}>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    ));
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>{renderContent()}</TableBody>
      </Table>
    </div>
  );
}
