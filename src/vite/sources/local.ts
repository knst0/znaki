import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

import { normalizePath } from "vite";

import type { IconData } from "../../types.ts";
import type { IconSource } from "../source.ts";
import { parseSvg } from "../svg.ts";

export interface LocalOptions {
  dir: string;
  prefix?: string;
}

export function local(options: LocalOptions): IconSource {
  let dir = resolve(options.dir);

  return {
    prefix: options.prefix ?? "local",
    init: (root: string) => {
      dir = resolve(root, options.dir);
    },
    get dirs(): string[] {
      return [normalizePath(dir)];
    },
    list: () => (existsSync(dir) ? walk(dir, "") : []),
    load: (name: string): IconData | null => {
      if (name.includes("..")) return null;
      const path = resolve(dir, `${name}.svg`);
      if (!path.startsWith(dir) || !existsSync(path)) return null;
      return parseSvg(readFileSync(path, "utf-8"));
    },
  };
}

function walk(dir: string, base: string): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const child = base ? posix.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) names.push(...walk(resolve(dir, entry.name), child));
    else if (entry.name.endsWith(".svg")) names.push(child.slice(0, -4));
  }
  return names;
}
