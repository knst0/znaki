import type { JSX } from "@solidjs/web";
import { spriteUrl } from "znaki/runtime";

export function PreloadSprite(): JSX.Element {
  return <link rel="preload" as="image" type="image/svg+xml" href={spriteUrl} />;
}
