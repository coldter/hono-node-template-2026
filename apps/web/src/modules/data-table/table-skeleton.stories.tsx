import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/modules/ui/table";
import { TableSkeleton } from "./table-skeleton";

type SkeletonHostProps = {
  columnCount: number;
  rowCount?: number;
};

function SkeletonHost({ columnCount, rowCount }: SkeletonHostProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {Array.from({ length: columnCount }).map((_, i) => (
              <TableHead key={`head-${i}`}>Column {i + 1}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableSkeleton columnCount={columnCount} rowCount={rowCount} />
        </TableBody>
      </Table>
    </div>
  );
}

const meta = {
  component: SkeletonHost,
  parameters: {
    docs: {
      description: {
        component:
          "Row-level loading skeleton rendered inside the table body while data is loading.",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Patterns/DataTable/Parts/TableSkeleton",
} satisfies Meta<typeof SkeletonHost>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { columnCount: 4 } };

export const ThreeRows: Story = { args: { columnCount: 4, rowCount: 3 } };

export const ManyColumns: Story = { args: { columnCount: 8, rowCount: 6 } };
