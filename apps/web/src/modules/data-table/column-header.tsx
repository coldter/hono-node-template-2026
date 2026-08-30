import {
  ArrowDownIcon,
  ArrowUpIcon,
  CaretSortIcon,
  EyeNoneIcon,
} from "@radix-ui/react-icons";
import type { Column, RowData } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { Button } from "@/modules/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/modules/ui/dropdown-menu";
import type { DataTableFeatures } from "./features";

type DataTableColumnHeaderProps<
  TData extends RowData,
  TValue,
> = React.HTMLAttributes<HTMLDivElement> & {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
};

export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="data-[state=open]:bg-accent h-8"
            size="sm"
            variant="ghost"
          >
            <span>{title}</span>
            <SortIcon column={column} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUpIcon className="text-muted-foreground/70 size-3.5" />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDownIcon className="text-muted-foreground/70 size-3.5" />
            Desc
          </DropdownMenuItem>
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeNoneIcon className="text-muted-foreground/70 size-3.5" />
                Hide
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SortIcon<TData extends RowData, TValue>({
  column,
}: {
  column: Column<DataTableFeatures, TData, TValue>;
}) {
  const isSorted = column.getIsSorted();
  if (isSorted === "desc") {
    return <ArrowDownIcon className="ms-2 h-4 w-4" />;
  }
  if (isSorted === "asc") {
    return <ArrowUpIcon className="ms-2 h-4 w-4" />;
  }
  return <CaretSortIcon className="ms-2 h-4 w-4" />;
}
