import { TableCell, TableRow } from "@/modules/ui/table";

type TableErrorProps = {
  message?: string;
  colSpan: number;
};

export function TableError({
  message = "Failed to load data.",
  colSpan,
}: TableErrorProps) {
  return (
    <TableRow>
      <TableCell
        className="h-24 text-center text-destructive"
        colSpan={colSpan}
      >
        {message}
      </TableCell>
    </TableRow>
  );
}
