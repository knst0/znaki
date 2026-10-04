import type { JSX, SVGProps } from "react";
import type { IconName } from "znaki";

declare module "znaki" {
  interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name" | "children" | "dangerouslySetInnerHTML"> {
    name: IconName;
    size?: number | string;
  }
  function Icon(props: IconProps): JSX.Element;
  function PreloadSprite(): JSX.Element;
}
