import type { ReactNode } from "react";
import { useAuthorization } from "@/hooks/use-authorization";

interface AuthorizedProps {
  capability: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function Authorized({
  capability,
  children,
  fallback = null,
}: AuthorizedProps) {
  const { capabilities, isLoading } = useAuthorization();

  if (isLoading) {
    return null;
  }

  if (!capabilities[capability]) {
    return fallback;
  }

  return children;
}
