type EventCategory = "auth" | "user" | "role";

type BadgeStyle = {
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
};

const eventCategoryMap: Record<string, EventCategory> = {
  "auth.login.success": "auth",
  "auth.login.failed": "auth",
  "auth.logout": "auth",
  "auth.password.changed": "auth",
  "auth.session.revoked": "auth",
  "user.created": "user",
  "user.updated": "user",
  "user.deleted": "user",
  "user.deactivated": "user",
  "user.activated": "user",
  "user.unlocked": "user",
  "user.viewed": "user",
  "user.listed": "user",
  "role.created": "role",
  "role.updated": "role",
  "role.deleted": "role",
  "role.assigned": "role",
  "role.unassigned": "role",
};

const eventDisplayNames: Record<string, string> = {
  "auth.login.success": "Login Success",
  "auth.login.failed": "Login Failed",
  "auth.logout": "Logout",
  "auth.password.changed": "Password Changed",
  "auth.session.revoked": "Session Revoked",
  "user.created": "User Created",
  "user.updated": "User Updated",
  "user.deleted": "User Deleted",
  "user.deactivated": "User Deactivated",
  "user.activated": "User Activated",
  "user.unlocked": "User Unlocked",
  "user.viewed": "User Viewed",
  "user.listed": "Users Listed",
  "role.created": "Role Created",
  "role.updated": "Role Updated",
  "role.deleted": "Role Deleted",
  "role.assigned": "Role Assigned",
  "role.unassigned": "Role Unassigned",
};

// Badge styles keyed by event name for fine-grained control
const eventBadgeStyles: Record<string, BadgeStyle> = {
  "auth.login.success": {
    variant: "default",
    className:
      "bg-emerald-600/15 text-emerald-700 border-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  "auth.login.failed": {
    variant: "destructive",
    className:
      "bg-red-600/15 text-red-700 border-red-600/20 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",
  },
  "auth.logout": {
    variant: "secondary",
    className:
      "bg-slate-600/10 text-slate-600 border-slate-600/15 dark:bg-slate-400/10 dark:text-slate-400 dark:border-slate-400/15",
  },
  "auth.password.changed": {
    variant: "outline",
    className:
      "bg-amber-600/10 text-amber-700 border-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  },
  "auth.session.revoked": {
    variant: "outline",
    className:
      "bg-orange-600/10 text-orange-700 border-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  },
  "user.created": {
    variant: "default",
    className:
      "bg-blue-600/15 text-blue-700 border-blue-600/20 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/20",
  },
  "user.updated": {
    variant: "outline",
    className:
      "bg-sky-600/10 text-sky-700 border-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
  },
  "user.deleted": {
    variant: "destructive",
    className:
      "bg-red-600/15 text-red-700 border-red-600/20 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",
  },
  "user.deactivated": {
    variant: "outline",
    className:
      "bg-orange-600/10 text-orange-700 border-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  },
  "user.activated": {
    variant: "default",
    className:
      "bg-emerald-600/15 text-emerald-700 border-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  "user.unlocked": {
    variant: "outline",
    className:
      "bg-teal-600/10 text-teal-700 border-teal-600/20 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20",
  },
  "user.viewed": {
    variant: "secondary",
    className:
      "bg-slate-600/10 text-slate-600 border-slate-600/15 dark:bg-slate-400/10 dark:text-slate-400 dark:border-slate-400/15",
  },
  "user.listed": {
    variant: "secondary",
    className:
      "bg-slate-600/10 text-slate-600 border-slate-600/15 dark:bg-slate-400/10 dark:text-slate-400 dark:border-slate-400/15",
  },
  "role.created": {
    variant: "default",
    className:
      "bg-violet-600/15 text-violet-700 border-violet-600/20 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/20",
  },
  "role.updated": {
    variant: "outline",
    className:
      "bg-purple-600/10 text-purple-700 border-purple-600/20 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
  },
  "role.deleted": {
    variant: "destructive",
    className:
      "bg-red-600/15 text-red-700 border-red-600/20 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20",
  },
  "role.assigned": {
    variant: "outline",
    className:
      "bg-indigo-600/10 text-indigo-700 border-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20",
  },
  "role.unassigned": {
    variant: "outline",
    className:
      "bg-fuchsia-600/10 text-fuchsia-700 border-fuchsia-600/20 dark:bg-fuchsia-500/10 dark:text-fuchsia-400 dark:border-fuchsia-500/20",
  },
};

const defaultBadgeStyle: BadgeStyle = {
  variant: "outline",
  className: "",
};

const eventBadgeDotClassNames = [
  ["emerald", "bg-emerald-500"],
  ["red", "bg-red-500"],
  ["blue", "bg-blue-500"],
  ["amber", "bg-amber-500"],
  ["orange", "bg-orange-500"],
  ["violet", "bg-violet-500"],
  ["purple", "bg-violet-500"],
  ["indigo", "bg-indigo-500"],
  ["sky", "bg-sky-500"],
  ["teal", "bg-teal-500"],
  ["fuchsia", "bg-fuchsia-500"],
  ["slate", "bg-slate-500"],
] as const;

// Lucide icon name strings -- we dynamically import in the component,
// but keep a string map here so the util stays pure (no React deps).
const eventIconNames: Record<string, string> = {
  "auth.login.success": "LogIn",
  "auth.login.failed": "ShieldX",
  "auth.logout": "LogOut",
  "auth.password.changed": "KeyRound",
  "auth.session.revoked": "ShieldAlert",
  "user.created": "UserPlus",
  "user.updated": "UserCog",
  "user.deleted": "UserMinus",
  "user.deactivated": "UserX",
  "user.activated": "UserCheck",
  "user.unlocked": "Unlock",
  "user.viewed": "Eye",
  "user.listed": "List",
  "role.created": "ShieldCheck",
  "role.updated": "Shield",
  "role.deleted": "ShieldX",
  "role.assigned": "ShieldCheck",
  "role.unassigned": "ShieldAlert",
};

/** @public ignore knip might be useful for future */
export function getEventCategory(event: string): EventCategory {
  return eventCategoryMap[event] ?? "auth";
}

export function getEventDisplayName(event: string): string {
  return eventDisplayNames[event] ?? event;
}

export function getEventBadgeStyle(event: string): BadgeStyle {
  return eventBadgeStyles[event] ?? defaultBadgeStyle;
}

export function getEventBadgeDotClassName(event: string): string {
  const badgeClassName = getEventBadgeStyle(event).className;

  for (const [token, dotClassName] of eventBadgeDotClassNames) {
    if (badgeClassName.includes(token)) {
      return dotClassName;
    }
  }

  return "bg-slate-500";
}

export function getEventIconName(event: string): string {
  return eventIconNames[event] ?? "Activity";
}

function getActorDescription(actorType: string): string {
  if (actorType === "system") {
    return "The system";
  }

  if (actorType === "api") {
    return "An API call";
  }

  return "A user";
}

export function getActorTypeLabel(actorType: string): string {
  switch (actorType) {
    case "user":
      return "User";
    case "system":
      return "System";
    case "api":
      return "API";
    default:
      return actorType;
  }
}

export function getTargetTypeLabel(targetType: string | null): string {
  if (!targetType) {
    return "N/A";
  }
  switch (targetType) {
    case "user":
      return "User";
    case "role":
      return "Role";
    case "session":
      return "Session";
    default:
      return targetType;
  }
}

/**
 * Generate a concise human-readable description of what happened.
 */
export function getEventDescription(
  event: string,
  actorType: string,
  metadata: Record<string, unknown> | null
): string {
  const actor = getActorDescription(actorType);

  switch (event) {
    case "auth.login.success":
      return `${actor} successfully logged in.`;
    case "auth.login.failed": {
      const reason = metadata?.reason;
      const attempts = metadata?.attempts;
      const parts = [`${actor} failed to log in`];
      if (reason) {
        parts[0] += ` (${String(reason).replace(/_/g, " ")})`;
      }
      if (attempts) {
        parts.push(`Attempt #${String(attempts)}`);
      }
      return `${parts.join(". ")}.`;
    }
    case "auth.logout":
      return `${actor} logged out.`;
    case "auth.password.changed":
      return `${actor} changed the password.`;
    case "auth.session.revoked":
      return `${actor} revoked a session.`;
    case "user.created":
      return `${actor} created a new user account.`;
    case "user.updated":
      return `${actor} updated user details.`;
    case "user.deleted":
      return `${actor} deleted a user account.`;
    case "user.deactivated": {
      const reason = metadata?.reason;
      return reason
        ? `${actor} deactivated the user. Reason: ${String(reason)}`
        : `${actor} deactivated the user.`;
    }
    case "user.activated":
      return `${actor} activated the user.`;
    case "user.unlocked":
      return `${actor} unlocked the user account.`;
    case "user.viewed":
      return `${actor} viewed user details.`;
    case "user.listed":
      return `${actor} listed users.`;
    case "role.created":
      return `${actor} created a new role.`;
    case "role.updated":
      return `${actor} updated a role.`;
    case "role.deleted":
      return `${actor} deleted a role.`;
    case "role.assigned":
      return `${actor} changed role assignments.`;
    case "role.unassigned":
      return `${actor} removed role assignments.`;
    default:
      return `${actor} performed "${event}".`;
  }
}

/**
 * All unique event types for filter options.
 */
export const ALL_EVENT_TYPES = Object.keys(eventDisplayNames);

/**
 * All unique target types for filter options.
 */
export const ALL_TARGET_TYPES = ["user", "role", "session"] as const;
