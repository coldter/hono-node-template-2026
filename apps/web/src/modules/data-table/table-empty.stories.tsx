import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/ui/table";
import { TableEmpty } from "./table-empty";

type EmptyHostProps = {
  message?: string;
  colSpan: number;
};

function EmptyHost({ message, colSpan }: EmptyHostProps) {
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
          <TableEmpty colSpan={colSpan} message={message} />
        </TableBody>
      </Table>
    </div>
  );
}

const meta = {
  title: "Patterns/DataTable/Parts/TableEmpty",
  component: EmptyHost,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Row-level empty state rendered inside the table body when there are no rows.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof EmptyHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { colSpan: 4 } };

export const CustomMessage: Story = {
  args: { colSpan: 4, message: "No users match your filters." },
};
