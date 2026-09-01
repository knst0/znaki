declare module "virtual:znaki/sprite" {
  export const spriteUrl: string;
  export const staticNames: ReadonlySet<string>;
}

declare module "virtual:znaki/registry" {
  import type { IconData } from "znaki";

  export const registry: Record<string, () => Promise<{ default: IconData }>>;
}

declare module "virtual:znaki/icon/*" {
  import type { IconData } from "znaki";

  const data: IconData;
  export default data;
}
