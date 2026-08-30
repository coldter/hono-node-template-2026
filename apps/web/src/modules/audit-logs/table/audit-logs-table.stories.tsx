import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTable } from "@tanstack/react-table";
import { DataTable } from "@/modules/data-table/data-table";
import { dataTableFeatures } from "@/modules/data-table/features";
import { DataTablePagination } from "@/modules/data-table/pagination";
import { DataTableToolbar } from "@/modules/data-table/toolbar";
import { type AuditLog, auditLogsColumns } from "./columns";

const mockAuditLogs: AuditLog[] = [
  {
    actorId: "user_abc123def456",
    actorType: "user",
    createdAt: "2026-04-24T10:15:00.000Z",
    event: "auth.login.success",
    id: "log_1",
    ipAddress: "192.168.1.10",
    metadata: null,
    targetId: null,
    targetType: null,
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_abc123def456",
    actorType: "user",
    createdAt: "2026-04-24T10:10:00.000Z",
    event: "auth.login.failed",
    id: "log_2",
    ipAddress: "192.168.1.10",
    metadata: { attempts: 2, reason: "invalid_password" },
    targetId: null,
    targetType: null,
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_admin0001",
    actorType: "user",
    createdAt: "2026-04-24T09:45:00.000Z",
    event: "user.created",
    id: "log_3",
    ipAddress: "192.168.1.5",
    metadata: null,
    targetId: "user_new9999",
    targetType: "user",
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_admin0001",
    actorType: "user",
    createdAt: "2026-04-24T09:30:00.000Z",
    event: "user.deactivated",
    id: "log_4",
    ipAddress: "192.168.1.5",
    metadata: { reason: "requested by user" },
    targetId: "user_old1234",
    targetType: "user",
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_admin0001",
    actorType: "user",
    createdAt: "2026-04-24T09:25:00.000Z",
    event: "role.assigned",
    id: "log_5",
    ipAddress: "192.168.1.5",
    metadata: null,
    targetId: "user_new9999",
    targetType: "user",
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_admin0001",
    actorType: "user",
    createdAt: "2026-04-24T09:00:00.000Z",
    event: "role.created",
    id: "log_6",
    ipAddress: "192.168.1.5",
    metadata: null,
    targetId: "role_editor01",
    targetType: "role",
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: null,
    actorType: "system",
    createdAt: "2026-04-24T08:50:00.000Z",
    event: "auth.session.revoked",
    id: "log_7",
    ipAddress: null,
    metadata: null,
    targetId: "sess_abcdef",
    targetType: "session",
    userAgent: null,
  },
  {
    actorId: "user_admin0001",
    actorType: "system",
    createdAt: "2026-04-24T08:30:00.000Z",
    event: "user.listed",
    id: "log_8",
    ipAddress: "10.0.0.5",
    metadata: null,
    targetId: null,
    targetType: null,
    userAgent: "curl/8.0",
  },
  {
    actorId: "user_abc123def456",
    actorType: "user",
    createdAt: "2026-04-24T08:15:00.000Z",
    event: "auth.password.changed",
    id: "log_9",
    ipAddress: "192.168.1.10",
    metadata: null,
    targetId: null,
    targetType: null,
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_admin0001",
    actorType: "user",
    createdAt: "2026-04-24T08:00:00.000Z",
    event: "user.viewed",
    id: "log_10",
    ipAddress: "192.168.1.5",
    metadata: null,
    targetId: "user_abc123def456",
    targetType: "user",
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_admin0001",
    actorType: "user",
    createdAt: "2026-04-24T07:45:00.000Z",
    event: "role.unassigned",
    id: "log_11",
    ipAddress: "192.168.1.5",
    metadata: null,
    targetId: "user_old1234",
    targetType: "user",
    userAgent: "Mozilla/5.0",
  },
  {
    actorId: "user_abc123def456",
    actorType: "user",
    createdAt: "2026-04-24T07:30:00.000Z",
    event: "auth.logout",
    id: "log_12",
    ipAddress: "192.168.1.10",
    metadata: null,
    targetId: null,
    targetType: null,
    userAgent: "Mozilla/5.0",
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
  const table = useTable({
    columns: auditLogsColumns,
    data,
    features: dataTableFeatures,
    initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
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
  component: AuditLogsTableStory,
  parameters: {
    docs: {
      description: {
        component:
          "Feature-level composition for the audit logs table. Uses the real `auditLogsColumns` with mock `AuditLog` rows and local table state (no `useTableUrlState`, no query, no detail sheet).",
      },
    },
    layout: "padded",
  },
  tags: ["autodocs"],
  title: "Features/AuditLogs/AuditLogsTable",
} satisfies Meta<typeof AuditLogsTableStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: mockAuditLogs } };

export const Loading: Story = { args: { data: [], isLoading: true } };

export const Errored: Story = { args: { data: [], isError: true } };

export const Empty: Story = { args: { data: [] } };
