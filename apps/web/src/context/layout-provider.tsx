import type * as React from "react";
import { createContext, useContext } from "react";
import { type Collapsible, useUIStore, type Variant } from "@/store";

const DEFAULT_VARIANT = "floating";
const DEFAULT_COLLAPSIBLE = "icon";

type LayoutContextType = {
  resetLayout: () => void;

  defaultCollapsible: Collapsible;
  collapsible: Collapsible;
  setCollapsible: (collapsible: Collapsible) => void;

  defaultVariant: Variant;
  variant: Variant;
  setVariant: (variant: Variant) => void;
};

const LayoutContext = createContext<LayoutContextType | null>(null);

type LayoutProviderProps = {
  children: React.ReactNode;
};

export function LayoutProvider({ children }: LayoutProviderProps) {
  const collapsible = useUIStore((state) => state.collapsible);
  const setCollapsibleStore = useUIStore((state) => state.setCollapsible);
  const variant = useUIStore((state) => state.variant);
  const setVariantStore = useUIStore((state) => state.setVariant);

  const setCollapsible = (newCollapsible: Collapsible) => {
    setCollapsibleStore(newCollapsible);
  };

  const setVariant = (newVariant: Variant) => {
    setVariantStore(newVariant);
  };

  const resetLayout = () => {
    setCollapsible(DEFAULT_COLLAPSIBLE);
    setVariant(DEFAULT_VARIANT);
  };

  const contextValue: LayoutContextType = {
    resetLayout,
    defaultCollapsible: DEFAULT_COLLAPSIBLE,
    collapsible,
    setCollapsible,
    defaultVariant: DEFAULT_VARIANT,
    variant,
    setVariant,
  };

  return <LayoutContext value={contextValue}>{children}</LayoutContext>;
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
