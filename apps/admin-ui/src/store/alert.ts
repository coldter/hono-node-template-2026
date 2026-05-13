import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

export const DOWN_ALERT_TYPES = [
  "offline",
  "auth_expired",
  "session_invalidated",
  "auth_unavailable",
  "maintenance",
  "forbidden",
] as const;

export type DownAlertType = (typeof DOWN_ALERT_TYPES)[number] | null;

interface AlertStoreState {
  clearAlertStore: () => void;
  clearDownAlert: () => void;
  downAlert: DownAlertType;
  setDownAlert: (alert: DownAlertType) => void;
}

const initialState = {
  downAlert: null as DownAlertType,
};

export const useAlertStore = create<AlertStoreState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,
        setDownAlert: (downAlert) => set({ downAlert }),
        clearDownAlert: () => set({ downAlert: null }),
        clearAlertStore: () => set(initialState),
      }),
      {
        name: "alert-store",
        version: 1,
        storage: createJSONStorage(() => sessionStorage),
        partialize: (state) => ({ downAlert: state.downAlert }),
      }
    ),
    { name: "AlertStore" }
  )
);
