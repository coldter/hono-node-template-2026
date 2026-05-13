import { TableCell, TableRow } from "@/modules/ui/table";

type TableEmptyProps = {
  message?: string;
  colSpan: number;
};

export function TableEmpty({
  message = "No results found.",
  colSpan,
}: TableEmptyProps) {
  return (
    <TableRow>
      <TableCell className="h-24 text-center" colSpan={colSpan}>
        {message}
      </TableCell>
    </TableRow>
  );
}
