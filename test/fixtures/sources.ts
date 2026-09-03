import type { IconData, IconMode } from "../../src/types.ts";
import type { IconSource } from "../../src/vite/source.ts";
import { ICONS } from "./icons.ts";

export function fakeSource(prefix: string, icons: Record<string, IconData>, mode?: IconMode, dirs: string[] = []): IconSource {
  return {
    prefix,
    mode,
    dirs,
    list: () => Object.keys(icons),
    load: (name) => icons[name] ?? null,
  };
}

export function memorySource(mode?: IconMode, prefix = "i"): IconSource {
  return fakeSource(prefix, ICONS, mode);
}
