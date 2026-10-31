export { symbolId } from "./id.ts";
export type { IconData } from "./types.ts";

export interface IconNameMap {}

/** Extend this interface with your JSX implementation's native SVG attributes. */
export interface IconAttributes {
  [attribute: string]: unknown;
}

export interface IconProps extends IconAttributes {
  name: IconName;
  size?: number | string;
  children?: never;
  innerHTML?: never;
  dangerouslySetInnerHTML?: never;
}

export interface PreloadSpriteProps {
  /** Embed the main sprite in the page instead of preloading it; icons then reference it by `#id`. */
  inline?: boolean;
  children?: never;
}

// Compile-time JSX intrinsics: erased before the application's JSX transform.
// They have no runtime return value or dependency on a framework's JSX types.
export declare function Icon(props: IconProps): never;
export declare function PreloadSprite(props: PreloadSpriteProps): never;

export type IconName = [keyof IconNameMap] extends [never] ? string : Extract<keyof IconNameMap, string>;
