declare module "virtual:znaki/sprite" {
  export const spriteUrl: string;
  export const lazySpriteUrl: string;
  export const staticNames: ReadonlySet<string>;
  export const lazyNames: ReadonlySet<string>;
  export const inlineSprite: boolean;
}

declare module "virtual:znaki/inline-sprite" {
  export const spriteMarkup: string;
}
