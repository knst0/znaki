import type { IconData } from "../../src/types.ts";
import type { IconSource } from "../../src/vite/source.ts";
import { ICONS } from "./icons.ts";

export function fakeSource(prefix: string, icons: Record<string, IconData>, dirs: string[] = []): IconSource {
  return {
    prefix,
    dirs,
    list: () => Object.keys(icons),
    load: (name) => icons[name] ?? null,
  };
}

export function memorySource(prefix = "i"): IconSource {
  return fakeSource(prefix, ICONS);
}
