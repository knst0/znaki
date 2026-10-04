export const SPRITE_ID = "virtual:znaki/sprite";
export const REGISTRY_ID = "virtual:znaki/registry";
export const SHARD_PREFIX = "virtual:znaki/shard/";
export const COMPONENT_ID = "virtual:znaki/component";

export const SPRITE_RESOLVED = `\0${SPRITE_ID}`;
export const REGISTRY_RESOLVED = `\0${REGISTRY_ID}`;
export const SHARD_PREFIX_RESOLVED = `\0${SHARD_PREFIX}`;

export function shardId(key: string): string {
  return SHARD_PREFIX + key;
}

export function shardName(resolvedId: string): string {
  return resolvedId.slice(SHARD_PREFIX_RESOLVED.length);
}
