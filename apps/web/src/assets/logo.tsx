import type { SVGProps } from "react";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

interface LogoProps extends SVGProps<SVGSVGElement> {
  title?: string;
}

export function Logo({
  className,
  title = brand.logoText,
  ...props
}: LogoProps) {
  return (
    <svg
      className={cn("size-6", className)}
      fill="none"
      height="24"
      id="app-logo"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>{title}</title>
      <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
    </svg>
  );
}
