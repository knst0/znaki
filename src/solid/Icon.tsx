import type { JSX } from "@solidjs/web";
import { Loading, Show } from "@solidjs/web";
import { createMemo, omit } from "solid-js";
import type { IconData, IconName } from "znaki";
import { symbolId } from "znaki";
import { spriteUrl } from "virtual:znaki/sprite";

import { isSpriteName, loadIcon } from "./loader.ts";

export interface IconProps extends Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "innerHTML"> {
  name: IconName;
  size?: number | string;
  data?: IconData;
}

export function Icon(props: IconProps): JSX.Element {
  return (
    <Loading fallback={null}>
      <IconShell {...props} />
    </Loading>
  );
}

function IconShell(props: IconProps): JSX.Element {
  const rest = omit(props, "name", "size", "data");
  const data = createMemo<IconData | null>(() => props.data ?? (isSpriteName(props.name) ? null : loadIcon(props.name)));

  return (
    <svg
      width={props.size ?? "1em"}
      height={props.size ?? "1em"}
      viewBox={data()?.viewBox}
      aria-hidden={rest["aria-label"] ? undefined : "true"}
      {...data()?.attrs}
      {...rest}
    >
      <Show when={data()} fallback={<use href={`${spriteUrl}#${symbolId(props.name)}`} />}>
        {(icon) => <g innerHTML={icon().body} />}
      </Show>
    </svg>
  );
}
