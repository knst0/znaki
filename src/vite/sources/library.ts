import { resolve } from "node:path";

import { normalizePath } from "vite";

import type { IconData } from "../../types.ts";
import type { IconSource } from "../source.ts";
import { normalizeIcon, parseSvg } from "../svg.ts";

/** Adapt a package, JSON catalogue or another synchronous local icon format. */
export interface LibraryOptions<T> {
  prefix: string;
  /** Local names, without the source prefix. Re-read after watched files change. */
  list: () => Iterable<string>;
  load: (name: string) => T | null;
  /** Return SVG markup or structured SVG data; null means this name is unavailable. */
  parse: (value: T, name: string) => string | IconData | null;
  /** Watched directories, relative to Vite root unless absolute. */
  dirs?: string[];
  /** Initialize or reload catalogue state at build start and source invalidation. */
  init?: (root: string) => void;
}

export function library<T>(options: LibraryOptions<T>): IconSource {
  let dirs = (options.dirs ?? []).map((dir) => normalizePath(resolve(dir)));
  return {
    prefix: options.prefix,
    init(root) {
      dirs = (options.dirs ?? []).map((dir) => normalizePath(resolve(root, dir)));
      options.init?.(root);
    },
    get dirs() {
      return dirs;
    },
    list() {
      return [...options.list()];
    },
    load(name) {
      try {
        const value = options.load(name);
        if (value === null) return null;
        const parsed = options.parse(value, name);
        if (parsed === null) return null;
        if (typeof parsed !== "string") return normalizeIcon(parsed);
        const data = parseSvg(parsed);
        if (!data) throw new Error("parser did not return an SVG document");
        return data;
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        const fullName = options.prefix ? `${options.prefix}:${name}` : name;
        throw new Error(`znaki: library icon "${fullName}": ${detail}`, { cause });
      }
    },
  };
}
