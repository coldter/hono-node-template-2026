import { Badge } from "@/modules/ui/badge";

interface UserRoleBadgesProps {
  max?: number;
  roles: string[];
}

export function UserRoleBadges({ roles, max = 2 }: UserRoleBadgesProps) {
  const displayRoles = roles.slice(0, max);
  const remaining = roles.length - max;

  return (
    <div className="flex flex-wrap gap-1">
      {displayRoles.map((role) => (
        <Badge className="capitalize" key={role} variant="outline">
          {role}
        </Badge>
      ))}
      {remaining > 0 && <Badge variant="secondary">+{remaining}</Badge>}
    </div>
  );
}
