import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import type { IconData, IconMode } from "../../types.ts";
import type { IconSource } from "../source.ts";
import { parseSvg } from "../svg.ts";

export type TablerVariant = "outline" | "filled";

export interface TablerOptions {
  variant?: TablerVariant;
  prefix?: string;
  mode?: IconMode;
}

const PROBE: Record<TablerVariant, string> = {
  outline: "arrow-right",
  filled: "circle",
};

export function tabler(options: TablerOptions = {}): IconSource {
  const variant = options.variant ?? "outline";
  const dir = resolveDir(variant);

  return {
    prefix: options.prefix ?? "tabler",
    mode: options.mode,
    dirs: [],
    list: () =>
      readdirSync(dir)
        .filter((file) => file.endsWith(".svg"))
        .map((file) => file.slice(0, -4)),
    load: (name: string): IconData | null => {
      const path = resolve(dir, `${name}.svg`);
      if (!path.startsWith(dir) || !existsSync(path)) return null;
      return parseSvg(readFileSync(path, "utf-8"));
    },
  };
}

function resolveDir(variant: TablerVariant): string {
  const require = createRequire(import.meta.url);
  try {
    return dirname(require.resolve(`@tabler/icons/${variant}/${PROBE[variant]}.svg`));
  } catch {
    throw new Error(`znaki: cannot resolve "@tabler/icons" — install it to use the tabler() source`);
  }
}
