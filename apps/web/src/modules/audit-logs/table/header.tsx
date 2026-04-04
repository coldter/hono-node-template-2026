import { ScrollText } from "lucide-react";
import { Badge } from "@/modules/ui/badge";

type AuditLogsHeaderProps = {
  totalCount?: number;
};

export function AuditLogsHeader({ totalCount }: AuditLogsHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 flex size-10 items-center justify-center rounded-xl">
          <ScrollText className="text-primary size-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
            {totalCount !== undefined && (
              <Badge className="text-xs tabular-nums" variant="secondary">
                {totalCount.toLocaleString()}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            Track all system activity and user actions across your workspace.
          </p>
        </div>
      </div>
    </div>
  );
}
