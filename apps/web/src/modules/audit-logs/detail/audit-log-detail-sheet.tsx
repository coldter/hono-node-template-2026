import { format, formatDistanceToNow } from "date-fns";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/modules/ui/badge";
import { ScrollArea } from "@/modules/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/modules/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/modules/ui/tooltip";
import { EventIcon } from "../event-icon";
import {
  getActorTypeLabel,
  getEventBadgeStyle,
  getEventDescription,
  getEventDisplayName,
  getTargetTypeLabel,
} from "../event-utils";
import type { AuditLog } from "../table/columns";

type AuditLogDetailSheetProps = {
  log: AuditLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const FIELD_NAME_LEADING_CHAR_REGEX = /^\w/;

function CopyableValue({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="text-foreground inline-flex items-center gap-1 rounded-md font-mono text-xs transition-colors hover:text-blue-600 dark:hover:text-blue-400"
          onClick={handleCopy}
          type="button"
        >
          <span className="max-w-[200px] truncate">{value}</span>
          {copied ? (
            <Check className="text-emerald-500 size-3 shrink-0" />
          ) : (
            <Copy className="text-muted-foreground size-3 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {copied ? "Copied!" : `Copy ${label ?? "value"}`}
      </TooltipContent>
    </Tooltip>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group/row flex items-start justify-between gap-4 py-2.5">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <div className="text-right text-sm">{children}</div>
    </div>
  );
}

function MetadataValue({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="text-muted-foreground italic">None</span>;
  }

  if (
    typeof data === "string" ||
    typeof data === "number" ||
    typeof data === "boolean"
  ) {
    return <span className="font-mono text-xs">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground italic">Empty</span>;
    }
    return (
      <div className="flex flex-wrap justify-end gap-1">
        {data.map((item, idx) => (
          <Badge
            className="font-mono text-[10px]"
            key={`${String(item)}-${idx}`}
            variant="secondary"
          >
            {String(item)}
          </Badge>
        ))}
      </div>
    );
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if ("from" in obj && "to" in obj) {
      return (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-[10px]">from</span>
            <MetadataValue data={obj.from} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
              to
            </span>
            <MetadataValue data={obj.to} />
          </div>
        </div>
      );
    }

    return null;
  }

  return null;
}

function MetadataSection({ metadata }: { metadata: Record<string, unknown> }) {
  const entries = Object.entries(metadata);

  const changes = metadata.changes as Record<string, unknown> | undefined;
  const changedFields = metadata.changedFields as string[] | undefined;
  const otherEntries = entries.filter(
    ([key]) => key !== "changes" && key !== "changedFields"
  );

  return (
    <div className="space-y-3">
      {otherEntries.map(([key, value]) => {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          return null;
        }
        return (
          <DetailRow key={key} label={formatFieldName(key)}>
            <MetadataValue data={value} />
          </DetailRow>
        );
      })}

      {changes && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pt-1">
            <span className="text-sm font-medium">Changes</span>
            {changedFields && (
              <span className="text-muted-foreground text-xs">
                ({changedFields.length} field
                {changedFields.length === 1 ? "" : "s"})
              </span>
            )}
          </div>
          <div className="bg-muted/50 space-y-0 divide-y rounded-lg border p-0">
            {Object.entries(changes).map(([field, change]) => (
              <div
                className="flex items-start justify-between gap-4 px-3 py-2.5"
                key={field}
              >
                <code className="shrink-0 text-xs font-medium">{field}</code>
                <MetadataValue data={change} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatFieldName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .replace(FIELD_NAME_LEADING_CHAR_REGEX, (c) => c.toUpperCase())
    .trim();
}

function parseUserAgent(ua: string): { browser: string; os: string } {
  let browser = "Unknown";
  let os = "Unknown";

  if (ua.includes("Windows")) {
    os = "Windows";
  } else if (ua.includes("Mac OS X") || ua.includes("Macintosh")) {
    os = "macOS";
  } else if (ua.includes("Linux") && !ua.includes("Android")) {
    os = "Linux";
  } else if (ua.includes("Android")) {
    os = "Android";
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    os = "iOS";
  }

  if (ua.includes("FakerBot")) {
    browser = "FakerBot";
  } else if (ua.includes("Googlebot")) {
    browser = "Googlebot";
  } else if (ua.includes("Edg/")) {
    browser = "Edge";
  } else if (ua.includes("Chrome/")) {
    browser = "Chrome";
  } else if (ua.includes("Firefox/")) {
    browser = "Firefox";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    browser = "Safari";
  }

  return { browser, os };
}

export function AuditLogDetailSheet({
  log,
  open,
  onOpenChange,
}: AuditLogDetailSheetProps) {
  if (!log) {
    return null;
  }

  const style = getEventBadgeStyle(log.event);
  const dateObj = new Date(log.createdAt);
  const uaInfo = log.userAgent ? parseUserAgent(log.userAgent) : null;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="sm:max-w-[480px] p-0 flex flex-col" side="right">
        <SheetHeader className="border-b px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                style.className
              )}
            >
              <EventIcon className="size-5" event={log.event} />
            </span>
            <div className="space-y-1">
              <SheetTitle className="flex items-center gap-2 text-base leading-tight">
                {getEventDisplayName(log.event)}
              </SheetTitle>
              <SheetDescription className="text-xs leading-relaxed">
                {getEventDescription(log.event, log.actorType, log.metadata)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 overflow-hidden">
          <div className="divide-y px-6 flex flex-col max-w-full">
            <div className="py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Event Information
              </h3>
              <DetailRow label="Event">
                <Badge
                  className={cn("text-[11px] font-mono", style.className)}
                  variant="outline"
                >
                  {log.event}
                </Badge>
              </DetailRow>
              <DetailRow label="Log ID">
                <CopyableValue label="log ID" value={log.id} />
              </DetailRow>
              <DetailRow label="Timestamp">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs font-medium">
                    {format(dateObj, "PPpp")}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {formatDistanceToNow(dateObj, { addSuffix: true })}
                  </span>
                </div>
              </DetailRow>
            </div>

            <div className="py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Actor
              </h3>
              <DetailRow label="Type">
                <Badge className="text-[11px]" variant="secondary">
                  {getActorTypeLabel(log.actorType)}
                </Badge>
              </DetailRow>
              <DetailRow label="Actor ID">
                {log.actorId ? (
                  <CopyableValue label="actor ID" value={log.actorId} />
                ) : (
                  <span className="text-muted-foreground text-xs italic">
                    None
                  </span>
                )}
              </DetailRow>
            </div>

            <div className="py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Target
              </h3>
              <DetailRow label="Type">
                {log.targetType ? (
                  <Badge className="text-[11px]" variant="secondary">
                    {getTargetTypeLabel(log.targetType)}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs italic">
                    None
                  </span>
                )}
              </DetailRow>
              <DetailRow label="Target ID">
                {log.targetId ? (
                  <CopyableValue label="target ID" value={log.targetId} />
                ) : (
                  <span className="text-muted-foreground text-xs italic">
                    None
                  </span>
                )}
              </DetailRow>
            </div>

            <div className="py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Network
              </h3>
              <DetailRow label="IP Address">
                {log.ipAddress ? (
                  <CopyableValue label="IP address" value={log.ipAddress} />
                ) : (
                  <span className="text-muted-foreground text-xs italic">
                    None
                  </span>
                )}
              </DetailRow>
              {uaInfo && (
                <>
                  <DetailRow label="Browser">
                    <span className="text-xs">{uaInfo.browser}</span>
                  </DetailRow>
                  <DetailRow label="OS">
                    <span className="text-xs">{uaInfo.os}</span>
                  </DetailRow>
                </>
              )}
              {log.userAgent && (
                <DetailRow label="User Agent">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground max-w-[200px] truncate text-[10px] font-mono cursor-help">
                        {log.userAgent.slice(0, 40)}...
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <span className="text-[10px] break-all font-mono">
                        {log.userAgent}
                      </span>
                    </TooltipContent>
                  </Tooltip>
                </DetailRow>
              )}
            </div>

            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <div className="py-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Metadata
                </h3>
                <MetadataSection
                  metadata={log.metadata as Record<string, unknown>}
                />
              </div>
            )}

            <div className="py-4 pb-6 w-full max-w-full">
              <details className="group w-full max-w-full">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none hover:text-foreground transition-colors outline-none list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-ring outline-none rounded-sm w-fit group-open:mb-3">
                    <span className="inline-flex size-4 items-center justify-center transition-transform group-open:rotate-90 text-[10px]">
                      &#9654;
                    </span>
                    Raw JSON
                  </div>
                </summary>
                <div className="w-full relative">
                  <pre className="bg-muted overflow-x-auto rounded-lg border p-3.5 text-[11px] leading-relaxed font-mono w-full max-w-full scrollbar-thin">
                    {JSON.stringify(log, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
