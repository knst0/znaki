import { lazyNames, lazySpriteUrl, spriteUrl, staticNames } from "virtual:znaki/sprite";
import { symbolId } from "znaki";

export { spriteUrl, symbolId };
export { svgProps } from "./props.ts";

/** Resolve a configured icon name to its external SVG `use` href. */
export function spriteHref(name: string): string {
  const id = symbolId(name);
  if (staticNames.has(name)) return `${spriteUrl}#${id}`;
  if (lazyNames.has(name)) return `${lazySpriteUrl}#${id}`;
  throw new Error(`znaki: icon "${name}" is not in the sprite; configure includeIcons or lazyIcons`);
}
