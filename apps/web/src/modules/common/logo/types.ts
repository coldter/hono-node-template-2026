import type { SVGProps } from "react";

export type LogoProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  title?: string;
  width?: number;
  height?: number;
};
