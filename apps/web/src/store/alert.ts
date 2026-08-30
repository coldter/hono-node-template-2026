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
        clearAlertStore: () => set(initialState),
        clearDownAlert: () => set({ downAlert: null }),
        setDownAlert: (downAlert) => set({ downAlert }),
      }),
      {
        name: "alert-store",
        partialize: (state) => ({ downAlert: state.downAlert }),
        storage: createJSONStorage(() => sessionStorage),
        version: 1,
      }
    ),
    { name: "AlertStore" }
  )
);
