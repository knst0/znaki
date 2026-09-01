export { symbolId } from "./id.ts";
export type { IconData, IconMode } from "./types.ts";

export interface IconNameMap {}

export type IconName = [keyof IconNameMap] extends [never] ? string : Extract<keyof IconNameMap, string>;
