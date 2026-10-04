import { shardKey } from "../id.ts";
import type { IconData } from "../types.ts";
import { shardId } from "./ids.ts";
import type { SourceRegistry } from "./source.ts";

// ASCII markers embedded as JSON string literals. They survive bundling and
// minification (unlike comments), and renderChunk replaces their exact quoted
// form with JSON.stringify(JSON.stringify(payload)), keeping the JSON.parse()
// wrapper so the module shape never changes after resolution.
export const SPRITE_TOKEN = "__ZNAKI_SPRITE_NAMES__";

// Durable contract between emitted shard modules and the renderChunk scanner:
// the exact quoted form of this token is replaced with the final payload.
export function shardToken(key: string): string {
  return `__ZNAKI_SHARD__:${key}__`;
}

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

/** Sorted shard keys covering `names`. */
export function shardKeys(names: Iterable<string>): string[] {
  return [...new Set([...names].map((name) => shardKey(name)))].sort();
}

/** Group entries by shard key; entries within a group keep input order. */
export function groupByShard(entries: Iterable<SpriteEntry>): Map<string, SpriteEntry[]> {
  const groups = new Map<string, SpriteEntry[]>();
  for (const entry of entries) {
    const key = shardKey(entry[0]);
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

export function spriteModuleCode(urlExpression: string, names: readonly string[] | null): string {
  const set = names ? `[${names.map((name) => JSON.stringify(name)).join(", ")}]` : `JSON.parse(${JSON.stringify(SPRITE_TOKEN)})`;
  return `export const spriteUrl = ${urlExpression};\nexport const staticNames = new Set(${set});\n`;
}

export function registryModuleCode(keys: readonly string[]): string {
  // Imports below are the lazy shard loading boundary (exception to static imports).
  // Keys are the original candidates resolved by the bundler at module load, and
  // renderChunk never adds or removes imports. A candidate shard that ends up fully
  // covered by the sprite keeps an empty payload: a tiny empty shard is acceptable,
  // corrupt post-resolve chunk edits are not.
  const entries = keys.map((key) => `  ${JSON.stringify(key)}: () => import(${JSON.stringify(shardId(key))}),`).join("\n");
  return `export const shards = {\n${entries}\n};\n`;
}

export function shardModuleCode(key: string, entries?: Iterable<SpriteEntry>): string {
  if (!entries) return `export default JSON.parse(${JSON.stringify(shardToken(key))});\n`;
  const body = [...entries].map(([name, data]) => `  ${JSON.stringify(name)}: ${JSON.stringify(data)},`).join("\n");
  return `export default {\n${body}\n};\n`;
}
