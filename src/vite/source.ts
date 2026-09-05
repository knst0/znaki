import type { IconData } from "../types.ts";

export interface IconSource {
  prefix: string;
  init?: (root: string) => void;
  dirs: string[];
  list: () => string[];
  load: (name: string) => IconData | null;
}

export class SourceRegistry {
  #sources: IconSource[];
  #cache = new Map<string, IconData | null>();
  #names: string[] | null = null;

  constructor(sources: IconSource[]) {
    this.#sources = sources;
  }

  get watchDirs(): string[] {
    return this.#sources.flatMap((source) => source.dirs);
  }

  init(root: string): void {
    for (const source of this.#sources) source.init?.(root);
    this.invalidate();
  }

  invalidate(): void {
    this.#cache.clear();
    this.#names = null;
  }

  resolve(fullName: string): IconData | null {
    const cached = this.#cache.get(fullName);
    if (cached !== undefined) return cached;

    let resolved: IconData | null = null;
    for (const source of this.#sources) {
      const local = strip(fullName, source.prefix);
      if (local === null) continue;
      const data = source.load(local);
      if (data) {
        resolved = data;
        break;
      }
    }

    this.#cache.set(fullName, resolved);
    return resolved;
  }

  names(): string[] {
    if (this.#names) return this.#names;
    const all = new Set<string>();
    for (const source of this.#sources) {
      for (const name of source.list()) all.add(source.prefix ? `${source.prefix}:${name}` : name);
    }
    this.#names = [...all].sort();
    return this.#names;
  }
}

function strip(fullName: string, prefix: string): string | null {
  if (!prefix) return fullName.includes(":") ? null : fullName;
  return fullName.startsWith(`${prefix}:`) ? fullName.slice(prefix.length + 1) : null;
}
