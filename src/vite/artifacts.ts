import type { IconData } from "../types.ts";
import type { SourceRegistry } from "./source.ts";

// ASCII markers embedded as JSON string literals. They survive bundling and
// minification (unlike comments), and renderChunk replaces their exact quoted
// form, keeping the module shape unchanged after resolution.
export const SPRITE_TOKEN = "__ZNAKI_SPRITE_NAMES__";
export const LAZY_TOKEN = "__ZNAKI_LAZY_NAMES__";
export const SPRITE_URL_TOKEN = "__ZNAKI_SPRITE_URL__";
export const LAZY_URL_TOKEN = "__ZNAKI_LAZY_URL__";

export type SpriteEntry = [string, IconData];

/** Resolve validated names to entries, preserving input order. Drops names that no longer resolve. */
export function collectEntries(registry: SourceRegistry, names: Iterable<string>): SpriteEntry[] {
  const entries: SpriteEntry[] = [];
  for (const name of names) {
    const data = registry.resolve(name);
    if (data) entries.push([name, data]);
  }
  return entries;
}

export function spriteModuleCode(
  spriteUrlExpression: string,
  lazyUrlExpression: string,
  spriteNames: readonly string[] | null,
  lazyNames: readonly string[] | null,
): string {
  const spriteSet =
    spriteNames === null
      ? `JSON.parse(${JSON.stringify(SPRITE_TOKEN)})`
      : `[${spriteNames.map((name) => JSON.stringify(name)).join(", ")}]`;
  const lazySet =
    lazyNames === null ? `JSON.parse(${JSON.stringify(LAZY_TOKEN)})` : `[${lazyNames.map((name) => JSON.stringify(name)).join(", ")}]`;
  return (
    `export const spriteUrl = ${spriteUrlExpression};\n` +
    `export const lazySpriteUrl = ${lazyUrlExpression};\n` +
    `export const staticNames = new Set(${spriteSet});\n` +
    `export const lazyNames = new Set(${lazySet});\n`
  );
}
