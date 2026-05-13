import { onlineManager } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export const useOnlineManager = () => {
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());

  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((online) =>
      setIsOnline(online)
    );
    return () => unsubscribe();
  }, []);

  return { isOnline } as const;
};
