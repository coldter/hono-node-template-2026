import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";
export type Collapsible = "offcanvas" | "icon" | "none";
export type Variant = "inset" | "sidebar" | "floating";

interface UIStoreState {
  collapsible: Collapsible;

  resetUI: () => void;
  setCollapsible: (collapsible: Collapsible) => void;
  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  setVariant: (variant: Variant) => void;

  sidebarOpen: boolean;
  theme: Theme;
  variant: Variant;
}

const DEFAULT_THEME: Theme = "light";
const DEFAULT_COLLAPSIBLE: Collapsible = "icon";
const DEFAULT_VARIANT: Variant = "floating";
const DEFAULT_SIDEBAR_OPEN = true;

export const useUIStore = create<UIStoreState>()(
  devtools(
    persist(
      (set) => ({
        theme: DEFAULT_THEME,
        setTheme: (theme) => set({ theme }),

        collapsible: DEFAULT_COLLAPSIBLE,
        setCollapsible: (collapsible) => set({ collapsible }),

        variant: DEFAULT_VARIANT,
        setVariant: (variant) => set({ variant }),

        sidebarOpen: DEFAULT_SIDEBAR_OPEN,
        setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

        resetUI: () =>
          set({
            theme: DEFAULT_THEME,
            collapsible: DEFAULT_COLLAPSIBLE,
            variant: DEFAULT_VARIANT,
            sidebarOpen: DEFAULT_SIDEBAR_OPEN,
          }),
      }),
      {
        name: "ui-store",
        version: 1,
        storage: createJSONStorage(() => localStorage),
      }
    ),
    { name: "UIStore" }
  )
);
