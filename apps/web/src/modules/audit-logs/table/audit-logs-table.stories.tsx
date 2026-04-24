import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  getCoreRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { DataTable } from "@/modules/data-table/data-table";
import { DataTablePagination } from "@/modules/data-table/pagination";
import { DataTableToolbar } from "@/modules/data-table/toolbar";
import { type AuditLog, auditLogsColumns } from "./columns";

const mockAuditLogs: AuditLog[] = [
  {
    id: "log_1",
    event: "auth.login.success",
    actorId: "user_abc123def456",
    actorType: "user",
    targetId: null,
    targetType: null,
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T10:15:00.000Z",
  },
  {
    id: "log_2",
    event: "auth.login.failed",
    actorId: "user_abc123def456",
    actorType: "user",
    targetId: null,
    targetType: null,
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    metadata: { reason: "invalid_password", attempts: 2 },
    createdAt: "2026-04-24T10:10:00.000Z",
  },
  {
    id: "log_3",
    event: "user.created",
    actorId: "user_admin0001",
    actorType: "user",
    targetId: "user_new9999",
    targetType: "user",
    ipAddress: "192.168.1.5",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T09:45:00.000Z",
  },
  {
    id: "log_4",
    event: "user.deactivated",
    actorId: "user_admin0001",
    actorType: "user",
    targetId: "user_old1234",
    targetType: "user",
    ipAddress: "192.168.1.5",
    userAgent: "Mozilla/5.0",
    metadata: { reason: "requested by user" },
    createdAt: "2026-04-24T09:30:00.000Z",
  },
  {
    id: "log_5",
    event: "role.assigned",
    actorId: "user_admin0001",
    actorType: "user",
    targetId: "user_new9999",
    targetType: "user",
    ipAddress: "192.168.1.5",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T09:25:00.000Z",
  },
  {
    id: "log_6",
    event: "role.created",
    actorId: "user_admin0001",
    actorType: "user",
    targetId: "role_editor01",
    targetType: "role",
    ipAddress: "192.168.1.5",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T09:00:00.000Z",
  },
  {
    id: "log_7",
    event: "auth.session.revoked",
    actorId: null,
    actorType: "system",
    targetId: "sess_abcdef",
    targetType: "session",
    ipAddress: null,
    userAgent: null,
    metadata: null,
    createdAt: "2026-04-24T08:50:00.000Z",
  },
  {
    id: "log_8",
    event: "user.listed",
    actorId: "user_admin0001",
    actorType: "api",
    targetId: null,
    targetType: null,
    ipAddress: "10.0.0.5",
    userAgent: "curl/8.0",
    metadata: null,
    createdAt: "2026-04-24T08:30:00.000Z",
  },
  {
    id: "log_9",
    event: "auth.password.changed",
    actorId: "user_abc123def456",
    actorType: "user",
    targetId: null,
    targetType: null,
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T08:15:00.000Z",
  },
  {
    id: "log_10",
    event: "user.viewed",
    actorId: "user_admin0001",
    actorType: "user",
    targetId: "user_abc123def456",
    targetType: "user",
    ipAddress: "192.168.1.5",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T08:00:00.000Z",
  },
  {
    id: "log_11",
    event: "role.unassigned",
    actorId: "user_admin0001",
    actorType: "user",
    targetId: "user_old1234",
    targetType: "user",
    ipAddress: "192.168.1.5",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T07:45:00.000Z",
  },
  {
    id: "log_12",
    event: "auth.logout",
    actorId: "user_abc123def456",
    actorType: "user",
    targetId: null,
    targetType: null,
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    metadata: null,
    createdAt: "2026-04-24T07:30:00.000Z",
  },
];

type AuditLogsTableStoryProps = {
  data: AuditLog[];
  isLoading?: boolean;
  isError?: boolean;
};

function AuditLogsTableStory({
  data,
  isLoading,
  isError,
}: AuditLogsTableStoryProps) {
  const table = useReactTable({
    data,
    columns: auditLogsColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 5, pageIndex: 0 } },
  });

  return (
    <div className="@container/content space-y-4">
      <DataTableToolbar searchPlaceholder="Search events..." table={table} />
      <DataTable
        columns={auditLogsColumns}
        data={data}
        emptyMessage="No audit logs found."
        isError={isError}
        isLoading={isLoading}
        table={table}
      />
      <DataTablePagination table={table} />
    </div>
  );
}

const meta = {
  title: "Features/AuditLogs/AuditLogsTable",
  component: AuditLogsTableStory,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Feature-level composition for the audit logs table. Uses the real `auditLogsColumns` with mock `AuditLog` rows and local table state (no `useTableUrlState`, no query, no detail sheet).",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AuditLogsTableStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: mockAuditLogs } };

export const Loading: Story = { args: { data: [], isLoading: true } };

export const Errored: Story = { args: { data: [], isError: true } };

export const Empty: Story = { args: { data: [] } };
