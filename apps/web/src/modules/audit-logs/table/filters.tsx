import { Cross2Icon } from "@radix-ui/react-icons";
import type { NavigateFn } from "@/hooks/use-table-url-state";
import { cn } from "@/lib/utils";
import { Badge } from "@/modules/ui/badge";
import { Button } from "@/modules/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/select";
import { Separator } from "@/modules/ui/separator";
import type { AuditLogsSearch } from "@/routes/(protected)/audit-logs/index";
import {
  ALL_EVENT_TYPES,
  ALL_TARGET_TYPES,
  getEventBadgeDotClassName,
  getEventBadgeStyle,
  getEventDisplayName,
  getTargetTypeLabel,
} from "../event-utils";

type AuditLogsFiltersProps = {
  search: AuditLogsSearch;
  navigate: NavigateFn;
};

// Group events by category for the dropdown
const eventCategories = [
  {
    label: "Authentication",
    events: ALL_EVENT_TYPES.filter((e) => e.startsWith("auth.")),
  },
  {
    label: "Users",
    events: ALL_EVENT_TYPES.filter((e) => e.startsWith("user.")),
  },
  {
    label: "Roles",
    events: ALL_EVENT_TYPES.filter((e) => e.startsWith("role.")),
  },
];

export function AuditLogsFilters({ search, navigate }: AuditLogsFiltersProps) {
  const hasActiveFilters = search.event || search.targetType;

  function updateFilter(updates: Partial<AuditLogsSearch>) {
    navigate({
      search: (prev) => ({ ...prev, ...updates, page: 1 }),
      replace: true,
    });
  }

  function clearFilters() {
    navigate({
      search: (prev) => ({
        ...prev,
        event: undefined,
        targetType: undefined,
        actorId: undefined,
        page: 1,
      }),
      replace: true,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Event filter */}
        <Select
          onValueChange={(value) =>
            updateFilter({ event: value === "__all__" ? undefined : value })
          }
          value={search.event ?? "__all__"}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="All events" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All events</SelectItem>
            {eventCategories.map((category) => (
              <div key={category.label}>
                <div className="text-muted-foreground px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  {category.label}
                </div>
                {category.events.map((event) => (
                  <SelectItem key={event} value={event}>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 rounded-full shrink-0",
                          getEventBadgeDotClassName(event)
                        )}
                      />
                      {getEventDisplayName(event)}
                    </span>
                  </SelectItem>
                ))}
              </div>
            ))}
          </SelectContent>
        </Select>

        {/* Target type filter */}
        <Select
          onValueChange={(value) =>
            updateFilter({
              targetType:
                value === "__all__"
                  ? undefined
                  : (value as "user" | "role" | "session"),
            })
          }
          value={search.targetType ?? "__all__"}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="All targets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All targets</SelectItem>
            {ALL_TARGET_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {getTargetTypeLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <>
            <Separator className="h-4" orientation="vertical" />
            <Button
              className="h-8 px-2 text-xs"
              onClick={clearFilters}
              variant="ghost"
            >
              Reset
              <Cross2Icon className="ms-1 size-3" />
            </Button>
          </>
        )}
      </div>

      {/* Active filter badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">Active filters:</span>
          {search.event && (
            <Badge
              className={cn(
                "text-[11px] gap-1",
                getEventBadgeStyle(search.event).className
              )}
              variant="outline"
            >
              {getEventDisplayName(search.event)}
              <button
                className="hover:text-foreground ml-0.5 transition-colors"
                onClick={() => updateFilter({ event: undefined })}
                type="button"
              >
                <Cross2Icon className="size-3" />
              </button>
            </Badge>
          )}
          {search.targetType && (
            <Badge className="text-[11px] gap-1" variant="secondary">
              Target: {getTargetTypeLabel(search.targetType)}
              <button
                className="hover:text-foreground ml-0.5 transition-colors"
                onClick={() => updateFilter({ targetType: undefined })}
                type="button"
              >
                <Cross2Icon className="size-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
