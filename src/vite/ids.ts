export const SPRITE_ID = "virtual:znaki/sprite";
export const REGISTRY_ID = "virtual:znaki/registry";
export const ICON_PREFIX = "virtual:znaki/icon/";

export const SPRITE_RESOLVED = `\0${SPRITE_ID}`;
export const REGISTRY_RESOLVED = `\0${REGISTRY_ID}`;
export const ICON_PREFIX_RESOLVED = `\0${ICON_PREFIX}`;

export function iconId(name: string): string {
  return ICON_PREFIX + encodeURIComponent(name);
}

export function iconName(resolvedId: string): string {
  return decodeURIComponent(resolvedId.slice(ICON_PREFIX_RESOLVED.length));
}
