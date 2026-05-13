import { Avatar, AvatarFallback } from "@/modules/ui/avatar";

const recentActivity: { name: string; email: string; initials: string }[] = [];

export function RecentSales() {
  if (recentActivity.length === 0) {
    return <p className="text-muted-foreground text-sm">No recent activity.</p>;
  }

  return (
    <div className="space-y-8">
      {recentActivity.map((item) => (
        <div className="flex items-center gap-4" key={item.email}>
          <Avatar className="h-9 w-9">
            <AvatarFallback>{item.initials}</AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-wrap items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm leading-none font-medium">{item.name}</p>
              <p className="text-muted-foreground text-sm">{item.email}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
