import type { IconData } from "../../src/types.ts";

export const spriteUrl = "/assets/znaki-sprite.svg";
export const staticNames = new Set(["i:sprited", "i:alternate"]);

export const lazyIcon: IconData = {
  body: "<defs><linearGradient id='paint'><stop stop-color='red'/></linearGradient></defs><circle r='1' fill='url(#paint)'/>",
  viewBox: "0 0 32 32",
  attrs: { fill: "red" },
};

export const shards: Record<string, () => Promise<{ default: Record<string, IconData> }>> = {
  "i-la": () => Promise.resolve({ default: { "i:lazy": lazyIcon } }),
};
