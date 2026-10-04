import { shards } from "virtual:znaki/registry";
import { spriteUrl, staticNames } from "virtual:znaki/sprite";
import type { IconData, IconName } from "znaki";
import { shardKey, symbolId } from "znaki";

import { prefixIds } from "../svg-ids.ts";

export { spriteUrl, symbolId };

const cache = new Map<IconName, Promise<IconData | null>>();

export function isSpriteName(name: IconName): boolean {
  return staticNames.has(name);
}

/** Resolve a configured sprite name; unknown runtime input must not render a broken reference. */
export function spriteHref(name: string): string {
  if (!staticNames.has(name)) throw new Error(`znaki: icon "${name}" is not in the sprite; configure includeIcons or lazyIcons`);
  return `${spriteUrl}#${symbolId(name)}`;
}

export function loadIcon(name: IconName): Promise<IconData | null> {
  let pending = cache.get(name);
  if (!pending) {
    pending = resolveIcon(name);
    cache.set(name, pending);
  }
  return pending;
}

async function resolveIcon(name: IconName): Promise<IconData | null> {
  const load = shards[shardKey(name)];
  return load ? ((await load()).default[name] ?? null) : null;
}

/** Namespace inline SVG definitions for one mounted instance. */
export function scopeIcon(data: IconData, prefix: string): IconData {
  const body = prefixIds(data.body, prefix);
  return body === data.body ? data : { ...data, body };
}
