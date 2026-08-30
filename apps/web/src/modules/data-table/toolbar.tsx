import { Cross2Icon } from "@radix-ui/react-icons";
import type { ReactTable, RowData } from "@tanstack/react-table";
import { Button } from "@/modules/ui/button";
import { Input } from "@/modules/ui/input";
import { DataTableFacetedFilter } from "./faceted-filter";
import type { DataTableFeatures } from "./features";
import { DataTableViewOptions } from "./view-options";

type DataTableToolbarProps<TData extends RowData> = {
  table: ReactTable<DataTableFeatures, TData>;
  searchPlaceholder?: string;
  searchKey?: string;
  filters?: {
    columnId: string;
    title: string;
    options: {
      label: string;
      value: string;
      icon?: React.ComponentType<{ className?: string }>;
    }[];
  }[];
};

export function DataTableToolbar<TData extends RowData>({
  table,
  searchPlaceholder = "Filter...",
  searchKey,
  filters = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.state.columnFilters.length > 0 || table.state.globalFilter;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">
        {searchKey ? (
          <Input
            aria-label={searchPlaceholder}
            className="h-8 w-[150px] lg:w-[250px]"
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            placeholder={searchPlaceholder}
            value={
              (table.getColumn(searchKey)?.getFilterValue() as string) ?? ""
            }
          />
        ) : (
          <Input
            aria-label={searchPlaceholder}
            className="h-8 w-[150px] lg:w-[250px]"
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            placeholder={searchPlaceholder}
            value={table.state.globalFilter ?? ""}
          />
        )}
        <div className="flex gap-x-2">
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId);
            if (!column) {
              return null;
            }
            return (
              <DataTableFacetedFilter
                column={column}
                key={filter.columnId}
                options={filter.options}
                title={filter.title}
              />
            );
          })}
        </div>
        {isFiltered ? (
          <Button
            className="h-8 px-2 lg:px-3"
            onClick={() => {
              table.resetColumnFilters();
              table.setGlobalFilter("");
            }}
            variant="ghost"
          >
            Reset
            <Cross2Icon className="ms-2 h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <DataTableViewOptions table={table} />
    </div>
  );
}
