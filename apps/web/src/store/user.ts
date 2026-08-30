import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import type { SessionUser } from "@/modules/auth";
import { useLastUserStore } from "./last-user";

interface UserStoreState {
  clearUser: () => void;
  setUser: (user: SessionUser) => void;
  updateUser: (user: Partial<SessionUser>) => void;
  user: SessionUser | null;
}

export const useUserStore = create<UserStoreState>()(
  devtools(
    persist(
      (set) => ({
        clearUser: () => {
          set({ user: null });
        },

        setUser: (user: SessionUser) => {
          set({ user });
          useLastUserStore.getState().setLastUser(user);
        },

        updateUser: (updates: Partial<SessionUser>) => {
          set((state: UserStoreState) => {
            if (!state.user) {
              return state;
            }

            const updatedUser = { ...state.user, ...updates };
            useLastUserStore.getState().setLastUser(updatedUser);

            return { user: updatedUser };
          });
        },
        user: null,
      }),
      {
        name: "user-store",
        partialize: (state: UserStoreState) => ({
          user: state.user,
        }),
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: "UserStore" }
  )
);
