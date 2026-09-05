declare module "virtual:znaki/sprite" {
  export const spriteUrl: string;
  export const staticNames: ReadonlySet<string>;
}

declare module "virtual:znaki/registry" {
  import type { IconData } from "znaki";

  export const shards: Record<string, () => Promise<{ default: Record<string, IconData> }>>;
}

declare module "virtual:znaki/shard/*" {
  import type { IconData } from "znaki";

  const icons: Record<string, IconData>;
  export default icons;
}

declare module "virtual:znaki/icon/*" {
  import type { IconData } from "znaki";

  const data: IconData;
  export default data;
}
