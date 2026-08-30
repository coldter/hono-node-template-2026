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
        clearLastUser: () => {
          set({ lastUser: null });
        },
        lastUser: null,

        setLastUser: (user: LastUser | SessionUser) => {
          set({
            lastUser: {
              email: user.email,
              id: user.id,
              image: user.image ?? null,
              name: user.name,
            },
          });
        },
      }),
      {
        name: "last-user-store",
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: "LastUserStore" }
  )
);
