import type { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import { Bot, Globe, User } from "lucide-react";
import type { ListAuditLogsResponse } from "@/api.gen/types.gen";
import { cn } from "@/lib/utils";
import { DataTableColumnHeader } from "@/modules/data-table/column-header";
import type { DataTableFeatures } from "@/modules/data-table/features";
import { Badge } from "@/modules/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/modules/ui/tooltip";
import { EventIcon } from "../event-icon";
import {
  decodeAuditLogMetadata,
  getActorTypeLabel,
  getEventBadgeStyle,
  getEventDescription,
  getEventDisplayName,
  getTargetTypeLabel,
} from "../event-utils";

export type AuditLog = ListAuditLogsResponse["data"][number];

const actorTypeIcons = {
  api: Globe,
  system: Bot,
  user: User,
} satisfies Record<AuditLog["actorType"], typeof User>;

export const auditLogsColumns: ColumnDef<DataTableFeatures, AuditLog>[] = [
  {
    accessorKey: "event",
    cell: ({ row }) => {
      const event = row.getValue<string>("event");
      const style = getEventBadgeStyle(event);
      return (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg",
              style.className
            )}
          >
            <EventIcon className="size-3.5" event={event} />
          </span>
          <div className="flex flex-col gap-0.5">
            <Badge
              className={cn(
                "text-[11px] leading-none font-medium",
                style.className
              )}
              variant="outline"
            >
              {getEventDisplayName(event)}
            </Badge>
            <span className="text-muted-foreground line-clamp-1 max-w-[260px] text-[11px] leading-tight">
              {getEventDescription(
                event,
                row.original.actorType,
                decodeAuditLogMetadata(row.original.metadata)
              )}
            </span>
          </div>
        </div>
      );
    },
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Event" />
    ),
    size: 320,
  },
  {
    accessorKey: "actorType",
    cell: ({ row }) => {
      const { actorId, actorType } = row.original;
      const ActorIcon = actorTypeIcons[actorType] ?? User;
      return (
        <div className="flex items-center gap-2">
          <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-full">
            <ActorIcon className="text-muted-foreground size-3" />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-medium">
              {getActorTypeLabel(actorType)}
            </span>
            {actorId ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <code className="text-muted-foreground text-[10px] font-mono">
                    {actorId.slice(0, 12)}...
                  </code>
                </TooltipTrigger>
                <TooltipContent>
                  <code className="text-xs">{actorId}</code>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-muted-foreground text-[10px]">
                No actor
              </span>
            )}
          </div>
        </div>
      );
    },
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actor" />
    ),
    size: 180,
  },
  {
    accessorKey: "targetType",
    cell: ({ row }) => {
      const { targetId, targetType } = row.original;
      return (
        <div className="flex flex-col">
          <span className="text-xs font-medium">
            {getTargetTypeLabel(targetType)}
          </span>
          {targetId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <code className="text-muted-foreground text-[10px] font-mono">
                  {targetId.slice(0, 12)}...
                </code>
              </TooltipTrigger>
              <TooltipContent>
                <code className="text-xs">{targetId}</code>
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted-foreground text-[10px]">No target</span>
          )}
        </div>
      );
    },
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Target" />
    ),
    size: 160,
  },
  {
    accessorKey: "ipAddress",
    cell: ({ row }) => {
      const ip = row.getValue<string | null>("ipAddress");
      return ip ? (
        <code className="bg-muted rounded-md px-1.5 py-0.5 text-[11px] font-mono">
          {ip}
        </code>
      ) : (
        <span className="text-muted-foreground text-xs">--</span>
      );
    },
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="IP Address" />
    ),
    size: 140,
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => {
      const date = row.getValue<string>("createdAt");
      const dateObj = new Date(date);
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              {formatDistanceToNow(dateObj, { addSuffix: true })}
            </span>
          </TooltipTrigger>
          <TooltipContent>{format(dateObj, "PPpp")}</TooltipContent>
        </Tooltip>
      );
    },
    enableSorting: true,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="When" />
    ),
    size: 140,
  },
];
