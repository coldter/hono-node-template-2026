import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { type JSX, useState } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/modules/ui/button";
import { ScrollArea } from "@/modules/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/modules/ui/select";

type SidebarNavProps = React.HTMLAttributes<HTMLElement> & {
  items: {
    href: string;
    title: string;
    icon: JSX.Element;
  }[];
};

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [val, setVal] = useState(pathname ?? "/settings");

  const handleSelect = (e: string) => {
    setVal(e);
    navigate({ to: e });
  };

  return (
    <>
      <div className="p-1 md:hidden">
        <Select onValueChange={handleSelect} value={val}>
          <SelectTrigger className="h-12 sm:w-48">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.href} value={item.href}>
                <div className="flex gap-x-4 px-2 py-1">
                  <span className="scale-125">{item.icon}</span>
                  <span className="text-md">{item.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea
        className="bg-background hidden w-full min-w-40 px-1 py-2 md:block"
        orientation="horizontal"
        type="always"
      >
        <nav
          className={cn(
            "flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0",
            className
          )}
          {...props}
        >
          {items.map((item) => (
            <Link
              className={cn(
                buttonVariants({ variant: "ghost" }),
                pathname === item.href
                  ? "bg-muted hover:bg-accent"
                  : "hover:bg-accent hover:underline",
                "justify-start"
              )}
              key={item.href}
              to={item.href}
            >
              <span className="me-2">{item.icon}</span>
              {item.title}
            </Link>
          ))}
        </nav>
      </ScrollArea>
    </>
  );
}
