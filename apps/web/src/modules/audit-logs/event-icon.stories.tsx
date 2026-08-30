import type { Meta, StoryObj } from "@storybook/react-vite";
import { cn } from "@/lib/utils";
import { EventIcon } from "./event-icon";
import { getEventBadgeStyle, getEventDisplayName } from "./event-utils";

const ALL_EVENTS = [
  "auth.login.success",
  "auth.login.failed",
  "auth.logout",
  "auth.password.changed",
  "auth.session.revoked",
  "user.created",
  "user.updated",
  "user.deleted",
  "user.deactivated",
  "user.activated",
  "user.unlocked",
  "user.viewed",
  "user.listed",
  "role.created",
  "role.updated",
  "role.deleted",
  "role.assigned",
  "role.unassigned",
] as const;

const meta = {
  args: { className: "size-4" },
  argTypes: {
    event: {
      control: "select",
      options: ALL_EVENTS,
    },
  },
  component: EventIcon,
  parameters: {
    docs: {
      description: {
        component:
          "Resolves an audit-log event name to the matching Lucide icon via `getEventIconName`. Falls back to `Activity` when the event is unknown.",
      },
    },
    layout: "centered",
  },
  tags: ["autodocs"],
  title: "Features/AuditLogs/EventIcon",
} satisfies Meta<typeof EventIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { event: "user.created" } };

export const UnknownEvent: Story = { args: { event: "some.unknown.event" } };

export const AllVariants: Story = {
  args: { event: "user.created" },
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {ALL_EVENTS.map((event) => {
        const style = getEventBadgeStyle(event);
        return (
          <div
            className="flex items-center gap-2 rounded-md border p-2"
            key={event}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                style.className
              )}
            >
              <EventIcon className="size-3.5" event={event} />
            </span>
            <span className="text-xs">{getEventDisplayName(event)}</span>
          </div>
        );
      })}
    </div>
  ),
};
