import type { LogoProps } from "./types";

export function LogoSymbol({
  title = "App",
  width = 32,
  height = 32,
  ...props
}: LogoProps) {
  return (
    <svg
      aria-labelledby="logoSymbolTitle"
      height={height}
      role="img"
      viewBox="0 0 32 32"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title id="logoSymbolTitle">{title}</title>
      <defs>
        <linearGradient
          id="logoGradientSymbol"
          x1="0%"
          x2="100%"
          y1="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect fill="url(#logoGradientSymbol)" height="32" rx="8" width="32" />
      <path
        d="M16 8l8 16h-4l-1.5-3h-5l-1.5 3h-4l8-16zm0 5.5l-1.5 3h3l-1.5-3z"
        fill="white"
      />
    </svg>
  );
}
