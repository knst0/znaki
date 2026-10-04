import type { SVGProps } from "react";

declare module "znaki" {
  interface IconAttributes extends Omit<SVGProps<SVGSVGElement>, "name" | "children" | "dangerouslySetInnerHTML"> {}
}
