export { shardKey, symbolId } from "./id.ts";
export type { IconData } from "./types.ts";

export interface IconNameMap {}

// Note: `Icon` and `PreloadSprite` are compile-time intrinsics lowered by the
// znaki Vite plugin. They have no runtime export here; per-target call
// signatures are declared by the generated `znaki.d.ts` (see `src/vite/dts.ts`).
export type IconName = [keyof IconNameMap] extends [never] ? string : Extract<keyof IconNameMap, string>;
