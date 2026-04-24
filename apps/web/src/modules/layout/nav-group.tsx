import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useAuthorization } from "@/hooks/use-authorization";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/modules/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/modules/ui/sidebar";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type {
  NavCollapsible,
  NavGroup as NavGroupProps,
  NavItem,
  NavLink,
} from "./types";

function useFilteredItems(items: NavItem[]): NavItem[] {
  const { capabilities } = useAuthorization();

  return useMemo(() => {
    const hasAccess = (permission: string | null | undefined): boolean => {
      if (permission === null || permission === undefined) {
        return true;
      }
      return capabilities[permission] === true;
    };

    const filterItems = (itemList: NavItem[]): NavItem[] =>
      itemList
        .map((item) => {
          if (!hasAccess(item.permission)) {
            return null;
          }

          if (item.items) {
            const filteredChildren = item.items.filter((child) =>
              hasAccess(child.permission)
            );

            if (filteredChildren.length === 0) {
              return null;
            }

            return { ...item, items: filteredChildren };
          }

          return item;
        })
        .filter((item): item is NavItem => item !== null);

    return filterItems(items);
  }, [items, capabilities]);
}

export function NavGroup({ title, items }: NavGroupProps) {
  const { state, isMobile } = useSidebar();
  const href = useLocation({ select: (location) => location.href });
  const filteredItems = useFilteredItems(items);

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {filteredItems.map((item) => {
          const key = `${item.title}-${item.url}`;

          if (!item.items) {
            return <SidebarMenuLink href={href} item={item} key={key} />;
          }

          if (state === "collapsed" && !isMobile) {
            return (
              <SidebarMenuCollapsedDropdown href={href} item={item} key={key} />
            );
          }

          return <SidebarMenuCollapsible href={href} item={item} key={key} />;
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className="rounded-full px-1 py-0 text-xs">{children}</Badge>;
}

function SidebarMenuLink({ item, href }: { item: NavLink; href: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
      >
        <Link onClick={() => setOpenMobile(false)} to={item.url}>
          {item.icon ? <item.icon /> : null}
          <span>{item.title}</span>
          {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarMenuCollapsible({
  item,
  href,
}: {
  item: NavCollapsible;
  href: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Collapsible
      asChild
      className="group/collapsible"
      defaultOpen={checkIsActive(href, item, true)}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {item.icon ? <item.icon /> : null}
            <span>{item.title}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="CollapsibleContent">
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  asChild
                  isActive={checkIsActive(href, subItem)}
                >
                  <Link onClick={() => setOpenMobile(false)} to={subItem.url}>
                    {subItem.icon ? <subItem.icon /> : null}
                    <span>{subItem.title}</span>
                    {subItem.badge ? (
                      <NavBadge>{subItem.badge}</NavBadge>
                    ) : null}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function SidebarMenuCollapsedDropdown({
  item,
  href,
}: {
  item: NavCollapsible;
  href: string;
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            isActive={checkIsActive(href, item)}
            tooltip={item.title}
          >
            {item.icon ? <item.icon /> : null}
            <span>{item.title}</span>
            {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
            <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right" sideOffset={4}>
          <DropdownMenuLabel>
            {item.title} {item.badge ? `(${item.badge})` : ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem asChild key={`${sub.title}-${sub.url}`}>
              <Link
                className={`${checkIsActive(href, sub) ? "bg-secondary" : ""}`}
                to={sub.url}
              >
                {sub.icon ? <sub.icon /> : null}
                <span className="max-w-52 text-wrap">{sub.title}</span>
                {sub.badge ? (
                  <span className="ms-auto text-xs">{sub.badge}</span>
                ) : null}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  return (
    href === item.url || // /endpint?search=param
    href.split("?")[0] === item.url || // endpoint
    !!item?.items?.filter((i) => i.url === href).length || // if child nav is active
    (mainNav &&
      href.split("/")[1] !== "" &&
      href.split("/")[1] === item?.url?.split("/")[1])
  );
}
