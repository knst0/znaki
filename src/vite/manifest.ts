import type { IconSource } from "./source.ts";

export type ZnakiTarget = "react" | "solid" | "reze";

export interface FrameworkScanResult {
  names: Iterable<string>;
  dynamic: boolean;
}

export interface FrameworkIntegration {
  /** Receives a normalized absolute file path, without a query string. */
  include: (id: string) => boolean;
  /** Analyze original source for collection; errors fail the build rather than dropping icons. */
  scan: (code: string, id: string) => FrameworkScanResult;
}

export interface ZnakiOptions {
  sources: IconSource[];
  /** Custom collection-only format support (include + scan), unioned with compiler results. */
  framework?: FrameworkIntegration;
  /** JSX backend for compiler output and generated types. Defaults to "react". */
  target?: ZnakiTarget;
  /** Always include in the sprite. Exact names or "*" wildcard patterns; exact means exact, no implicit prefix matching. */
  includeIcons?: string[];
  /** Allow lazy delivery. Exact names or "*" wildcard patterns; matches already in the sprite stay out of the lazy registry. */
  lazyIcons?: string[];
  /** Directories to scan initially for icon usage. Defaults to the Vite root. */
  include?: string[];
  /** Directories to skip while scanning. Build output is always skipped. */
  exclude?: string[];
  /** Path for generated icon-name types relative to the root, or false to disable. */
  dts?: string | false;
  /** Permit duplicate icon names across sources (first source wins). Default throws on collision. */
  allowOverrides?: boolean;
}

export function matchesPattern(pattern: string, name: string): boolean {
  if (!pattern.includes("*")) return pattern === name;
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`).test(name);
}

export function expandPatterns(patterns: readonly string[], available: readonly string[]): string[] {
  const known = new Set(available);
  const out = new Set<string>();
  for (const pattern of patterns) {
    if (!pattern.includes("*")) {
      if (known.has(pattern)) out.add(pattern);
      continue;
    }
    for (const name of available) {
      if (matchesPattern(pattern, name)) out.add(name);
    }
  }
  return [...out].sort();
}

/** Exact (non-wildcard) patterns with no match in `available`. */
export function missingExact(patterns: readonly string[], available: ReadonlySet<string>): string[] {
  const missing: string[] = [];
  for (const pattern of patterns) {
    if (!pattern.includes("*") && !available.has(pattern)) missing.push(pattern);
  }
  return missing.sort();
}

export interface ManifestInput {
  /** Statically collected icon names, already validated against the sources. */
  collected: Iterable<string>;
  includeExpanded: Iterable<string>;
  lazyExpanded: Iterable<string>;
}

export interface Manifest {
  /** Sorted sprite names: collected usage plus explicit includes. */
  sprite: string[];
  /** Sorted lazy names: explicit lazy matches not already in the sprite. */
  lazy: string[];
}

export function buildManifest(input: ManifestInput): Manifest {
  const sprite = new Set<string>(input.collected);
  for (const name of input.includeExpanded) sprite.add(name);
  const spriteList = [...sprite].sort();
  const inSprite = new Set(spriteList);
  const lazy = new Set<string>();
  for (const name of input.lazyExpanded) {
    if (!inSprite.has(name)) lazy.add(name);
  }
  return { sprite: spriteList, lazy: [...lazy].sort() };
}
