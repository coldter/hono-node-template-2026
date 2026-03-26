/**
 * Ability Context and Provider for CASL-based permissions.
 *
 * This provides a React context that holds the current user's ability,
 * which can be used to check permissions throughout the app.
 */

import {
  type AbilityContext as AbilityContextData,
  type AppAbility,
  defineAbilityFor,
} from "@repo/shared/abilities";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useUserStore } from "@/store/user";

// ============================================================
// CONTEXT
// ============================================================

const AbilityContext = createContext<AppAbility | null>(null);

// ============================================================
// PROVIDER
// ============================================================

interface AbilityProviderProps {
  children: ReactNode;
}

/**
 * Provides CASL ability to the React component tree.
 *
 * The ability is automatically built from the current user's permissions.
 */
export function AbilityProvider({ children }: AbilityProviderProps) {
  const user = useUserStore((state) => state.user);

  const ability = useMemo(() => {
    if (!user) {
      // Return a restricted ability for unauthenticated users
      return defineAbilityFor({
        userId: "",
        permissions: [],
      });
    }

    const ctx: AbilityContextData = {
      userId: user.id,
      permissions: user.permissions ?? [],
    };

    return defineAbilityFor(ctx);
  }, [user]);

  return (
    <AbilityContext.Provider value={ability}>
      {children}
    </AbilityContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

/**
 * Hook to access the current user's CASL ability.
 *
 * @example
 * ```tsx
 * import { useAbility } from "@/modules/permissions";
 * import { subject } from "@casl/ability";
 *
 * function UserDetails({ user }) {
 *   const ability = useAbility();
 *
 *   // Check if user can read this specific user
 *   if (ability.can("read", subject("User", user))) {
 *     return <UserView user={user} />;
 *   }
 *
 *   return <AccessDenied />;
 * }
 * ```
 */
export function useAbility(): AppAbility {
  const ability = useContext(AbilityContext);

  if (!ability) {
    throw new Error("useAbility must be used within an AbilityProvider");
  }

  return ability;
}

/**
 * Hook to check if the current user can perform an action.
 * Returns a stable `can` function that can be used in callbacks.
 *
 * @example
 * ```tsx
 * import { useCan } from "@/modules/permissions";
 *
 * function UserList({ users }) {
 *   const can = useCan();
 *
 *   return users.filter(user =>
 *     can("read", subject("User", user))
 *   ).map(user => <UserItem key={user.id} user={user} />);
 * }
 * ```
 */
export function useCan() {
  const ability = useAbility();
  return ability.can.bind(ability);
}
