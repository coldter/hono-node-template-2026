import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";
import type { SessionUser } from "@/modules/auth";

export interface LastUser {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

interface LastUserStoreState {
  clearLastUser: () => void;
  lastUser: LastUser | null;
  setLastUser: (user: LastUser | SessionUser) => void;
}

export const useLastUserStore = create<LastUserStoreState>()(
  devtools(
    persist(
      (set) => ({
        lastUser: null,

        setLastUser: (user: LastUser | SessionUser) => {
          set({
            lastUser: {
              id: user.id,
              email: user.email,
              name: user.name,
              image: user.image ?? null,
            },
          });
        },

        clearLastUser: () => {
          set({ lastUser: null });
        },
      }),
      {
        name: "last-user-store",
        version: 1,
        storage: createJSONStorage(() => localStorage),
      }
    ),
    { name: "LastUserStore" }
  )
);
