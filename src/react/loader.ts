import { staticNames } from "virtual:znaki/sprite";
import type { IconData, IconName } from "znaki";

let registryPromise: Promise<typeof import("virtual:znaki/registry")> | null = null;
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
  const load = (await registryPromise).registry[name];
  return load ? (await load()).default : null;
}
