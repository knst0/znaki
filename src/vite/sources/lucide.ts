import { createRequire } from "node:module";
import { dirname } from "node:path";

import type { IconSource } from "../source.ts";
import { local } from "./local.ts";

export interface LucideOptions {
  prefix?: string;
}

export function lucide(options: LucideOptions = {}): IconSource {
  const require = createRequire(import.meta.url);
  let dir: string;
  try {
    dir = dirname(require.resolve("lucide-static/icons/arrow-right.svg"));
  } catch {
    throw new Error('znaki: cannot resolve "lucide-static" — install it to use the lucide() source');
  }
  return local({ dir, prefix: options.prefix ?? "lucide" });
}
