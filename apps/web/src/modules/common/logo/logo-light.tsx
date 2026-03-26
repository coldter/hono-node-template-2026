import type { LogoProps } from "./types";

// Light-mode friendly (dark text on light background)
export function LogoLight({
  title = "App",
  width = 120,
  height = 32,
  ...props
}: LogoProps) {
  return (
    <svg
      aria-labelledby="logoLightTitle"
      height={height}
      role="img"
      viewBox="0 0 120 32"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title id="logoLightTitle">{title}</title>
      <defs>
        <linearGradient
          id="logoGradientLight"
          x1="0%"
          x2="100%"
          y1="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect fill="url(#logoGradientLight)" height="32" rx="8" width="32" />
      <path
        d="M16 8l8 16h-4l-1.5-3h-5l-1.5 3h-4l8-16zm0 5.5l-1.5 3h3l-1.5-3z"
        fill="white"
      />
      <text
        fill="#18181b"
        fontFamily="system-ui, sans-serif"
        fontSize="18"
        fontWeight="700"
        letterSpacing="-0.5"
        x="40"
        y="22"
      >
        Acme
      </text>
    </svg>
  );
}
