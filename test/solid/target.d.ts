import type { JSX } from "@solidjs/web";
import type { IconName } from "znaki";

declare module "znaki" {
  interface IconProps extends Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "name" | "children" | "innerHTML"> {
    name: IconName;
    size?: number | string;
  }
  function Icon(props: IconProps): JSX.Element;
  function PreloadSprite(): JSX.Element;
}
