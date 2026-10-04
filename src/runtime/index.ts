import type * as Registry from "virtual:znaki/registry";
import { spriteUrl, staticNames } from "virtual:znaki/sprite";
import type { IconData, IconName } from "znaki";
import { shardKey, symbolId } from "znaki";

export { spriteUrl, symbolId };

let registryPromise: Promise<typeof Registry> | null = null;
const cache = new Map<IconName, Promise<IconData | null>>();

export function isSpriteName(name: IconName): boolean {
  return staticNames.has(name);
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
  registryPromise ??= import("virtual:znaki/registry");
  const load = (await registryPromise).shards[shardKey(name)];
  return load ? ((await load()).default[name] ?? null) : null;
}
