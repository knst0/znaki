/** @jsxImportSource react */
import type { JSX, SVGProps } from "react";
import { Suspense, use } from "react";
import { spriteUrl } from "virtual:znaki/sprite";
import type { IconData, IconName } from "znaki";
import { symbolId } from "znaki";

import { isSpriteName, loadIcon } from "./loader.ts";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "dangerouslySetInnerHTML"> {
  name: IconName;
  size?: number | string;
}

export function Icon(props: IconProps): JSX.Element {
  if (isSpriteName(props.name)) return <IconShell {...props} />;

  return (
    <Suspense fallback={null}>
      <IconShell {...props} />
    </Suspense>
  );
}

function reactAttrs(attrs: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    const camel =
      key.startsWith("data-") || key.startsWith("aria-") ? key : key.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    result[camel] = value;
  }
  return result;
}

function IconShell({ name, size, ...rest }: IconProps): JSX.Element {
  const data: IconData | null = isSpriteName(name) ? null : use(loadIcon(name));

  return (
    <svg
      width={size ?? "1em"}
      height={size ?? "1em"}
      viewBox={data?.viewBox}
      aria-hidden={rest["aria-label"] ? undefined : "true"}
      {...(data ? reactAttrs(data.attrs) : undefined)}
      {...rest}
    >
      {data ? <g dangerouslySetInnerHTML={{ __html: data.body }} /> : <use href={`${spriteUrl}#${symbolId(name)}`} />}
    </svg>
  );
}
