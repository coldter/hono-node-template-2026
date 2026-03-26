import type { LinkProps } from "@tanstack/react-router";
import type { NavItemPermission } from "@/modules/permissions";

export type User = {
  name: string;
  email: string;
  avatar: string;
};

export type BaseNavItem = {
  title: string;
  badge?: string;
  icon?: React.ElementType;
  /**
   * Permission requirement for this nav item
   *
   * - undefined: No permission required (always visible)
   * - null: Explicitly no permission (for stubs/demos, always visible)
   * - PermissionIdentifier: Single permission required
   * - PermissionIdentifier[]: Any of these permissions required
   */
  permission?: NavItemPermission;
};

export type NavLink = BaseNavItem & {
  url: LinkProps["to"] | (string & {});
  items?: never;
};

export type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: LinkProps["to"] | (string & {}) })[];
  url?: never;
};

export type NavItem = NavCollapsible | NavLink;

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export type SidebarData = {
  user: User;
  navGroups: NavGroup[];
};
