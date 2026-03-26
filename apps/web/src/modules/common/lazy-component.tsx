import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { useInViewport } from "react-in-viewport";

export interface LazyComponentProps {
  children: ReactNode;
  className?: string;
  disconnectOnLeave?: boolean;
  fallback?: ReactNode;
  lazy?: boolean;
  viewportOptions?: {
    rootMargin?: string;
    threshold?: number | number[];
  };
}

export const LazyComponent = ({
  lazy = true,
  children,
  fallback = null,
  className,
  viewportOptions,
  disconnectOnLeave = true,
}: LazyComponentProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const once = useRef(false);

  const { inViewport } = useInViewport(
    ref as RefObject<HTMLElement>,
    viewportOptions,
    {
      disconnectOnLeave,
    }
  );

  useEffect(() => {
    if (inViewport) {
      once.current = true;
    }
  }, [inViewport]);

  const shouldRender = lazy ? once.current || inViewport : true;

  return (
    <div className={className} ref={ref}>
      {shouldRender ? children : (fallback ?? <div />)}
    </div>
  );
};
