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
        collapsible: DEFAULT_COLLAPSIBLE,

        resetUI: () =>
          set({
            collapsible: DEFAULT_COLLAPSIBLE,
            sidebarOpen: DEFAULT_SIDEBAR_OPEN,
            theme: DEFAULT_THEME,
            variant: DEFAULT_VARIANT,
          }),
        setCollapsible: (collapsible) => set({ collapsible }),
        setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
        setTheme: (theme) => set({ theme }),
        setVariant: (variant) => set({ variant }),

        sidebarOpen: DEFAULT_SIDEBAR_OPEN,
        theme: DEFAULT_THEME,

        variant: DEFAULT_VARIANT,
      }),
      {
        name: "ui-store",
        storage: createJSONStorage(() => localStorage),
        version: 1,
      }
    ),
    { name: "UIStore" }
  )
);
