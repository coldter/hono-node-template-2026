import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/ui/table";
import { TableError } from "./table-error";

type ErrorHostProps = {
  message?: string;
  colSpan: number;
};

function ErrorHost({ message, colSpan }: ErrorHostProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: colSpan }).map((_, i) => (
              <TableHead key={`head-${i}`}>Column {i + 1}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableError colSpan={colSpan} message={message} />
        </TableBody>
      </Table>
    </div>
  );
}

const meta = {
  title: "Patterns/DataTable/Parts/TableError",
  component: ErrorHost,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Row-level error state rendered inside the table body when the data query fails.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ErrorHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { colSpan: 4 } };

export const CustomMessage: Story = {
  args: { colSpan: 4, message: "Something went wrong while loading users." },
};
