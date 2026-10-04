import type { JSX } from "@solidjs/web";

declare module "znaki" {
  interface IconAttributes extends Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "name" | "children" | "innerHTML"> {}
}
