export const SPRITE_ID = "virtual:znaki/sprite";
export const REGISTRY_ID = "virtual:znaki/registry";
export const ICON_PREFIX = "virtual:znaki/icon/";
export const SHARD_PREFIX = "virtual:znaki/shard/";

export const SPRITE_RESOLVED = `\0${SPRITE_ID}`;
export const REGISTRY_RESOLVED = `\0${REGISTRY_ID}`;
export const ICON_PREFIX_RESOLVED = `\0${ICON_PREFIX}`;
export const SHARD_PREFIX_RESOLVED = `\0${SHARD_PREFIX}`;

export function iconId(name: string): string {
  return ICON_PREFIX + encodeURIComponent(name);
}

export function iconName(resolvedId: string): string {
  return decodeURIComponent(resolvedId.slice(ICON_PREFIX_RESOLVED.length));
}

export function shardId(key: string): string {
  return SHARD_PREFIX + key;
}

export function shardName(resolvedId: string): string {
  return resolvedId.slice(SHARD_PREFIX_RESOLVED.length);
}
