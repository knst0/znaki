import { staticNames } from "virtual:znaki/sprite";
import type { IconData, IconName } from "znaki";
import { shardKey } from "znaki";

let registryPromise: Promise<typeof import("virtual:znaki/registry")> | null = null;

export function isSpriteName(name: IconName): boolean {
  return staticNames.has(name);
}

export async function loadIcon(name: IconName): Promise<IconData | null> {
  registryPromise ??= import("virtual:znaki/registry");
  const load = (await registryPromise).shards[shardKey(name)];
  return load ? ((await load()).default[name] ?? null) : null;
}
