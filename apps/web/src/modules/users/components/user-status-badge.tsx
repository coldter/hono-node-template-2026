import { cn } from "@/lib/utils";
import { Badge } from "@/modules/ui/badge";
import { USER_STATUS_CONFIG, type UserStatus } from "../types";

interface UserStatusBadgeProps {
  className?: string;
  status: UserStatus;
}

export function UserStatusBadge({ status, className }: UserStatusBadgeProps) {
  const config = USER_STATUS_CONFIG[status];

  return (
    <Badge className={cn(config.className, className)} variant={config.variant}>
      {config.label}
    </Badge>
  );
}
