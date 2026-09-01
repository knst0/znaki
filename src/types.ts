export interface IconNameMap {}

export type IconName = [keyof IconNameMap] extends [never] ? string : Extract<keyof IconNameMap, string>;

export interface IconData {
  body: string;
  viewBox: string;
  attrs: Record<string, string>;
}

export type IconMode = "sprite" | "inline";
