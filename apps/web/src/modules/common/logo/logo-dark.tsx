import type { LogoProps } from "./types";

// Dark-mode friendly (light text on dark background)
export function LogoDark({
  title = "App",
  width = 120,
  height = 32,
  ...props
}: LogoProps) {
  return (
    <svg
      aria-labelledby="logoDarkTitle"
      height={height}
      role="img"
      viewBox="0 0 120 32"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title id="logoDarkTitle">{title}</title>
      <defs>
        <linearGradient
          id="logoGradientDark"
          x1="0%"
          x2="100%"
          y1="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      <rect fill="url(#logoGradientDark)" height="32" rx="8" width="32" />
      <path
        d="M16 8l8 16h-4l-1.5-3h-5l-1.5 3h-4l8-16zm0 5.5l-1.5 3h3l-1.5-3z"
        fill="white"
      />
      <text
        fill="#fafafa"
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
