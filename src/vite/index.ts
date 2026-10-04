import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { posix, resolve } from "node:path";

import MagicString from "magic-string";
import type { SourceMap } from "magic-string";
import { normalizePath } from "vite";
import type { EnvironmentModuleGraph, EnvironmentModuleNode, Plugin } from "vite";

import { collectEntries, LAZY_TOKEN, LAZY_URL_TOKEN, spriteModuleCode, SPRITE_TOKEN, SPRITE_URL_TOKEN } from "./artifacts.ts";
import { compileIcons } from "./compiler.ts";
import { writeDts } from "./dts.ts";
import { SPRITE_ID, SPRITE_RESOLVED } from "./ids.ts";
import { buildManifest, expandPatterns, missingExact } from "./manifest.ts";
import type { ZnakiOptions } from "./manifest.ts";
import { SourceRegistry } from "./source.ts";
import { spriteMarkup } from "./svg.ts";

export { local } from "./sources/local.ts";
export type { LocalOptions } from "./sources/local.ts";
export { tabler } from "./sources/tabler.ts";
export type { TablerOptions, TablerVariant } from "./sources/tabler.ts";
export { library } from "./sources/library.ts";
export type { LibraryOptions } from "./sources/library.ts";
export { lucide } from "./sources/lucide.ts";
export type { LucideOptions } from "./sources/lucide.ts";
export type { IconSource } from "./source.ts";
export type { ZnakiOptions } from "./manifest.ts";

const SOURCE_FILE_RE = /\.[tj]sx$/;
const DEV_SPRITE_PATH = "/@znaki/sprite.svg";
const DEV_LAZY_PATH = "/@znaki/lazy.svg";
const SKIPPED_DIRS: Record<string, true> = { node_modules: true, dist: true, build: true, coverage: true, "storybook-static": true };

interface FileIcons {
  names: Set<string>;
  dynamic: boolean;
}

interface EnvState {
  files: Map<string, FileIcons>;
  warned: Set<string>;
  spriteRef: string | null;
  lazyRef: string | null;
  spriteRequested: boolean;
}

interface TransformAnalysis {
  code: string;
  map?: SourceMap;
}

export default function znaki(options: ZnakiOptions): Plugin {
  const includePatterns = [...(options.includeIcons ?? [])].sort();
  const lazyPatterns = [...(options.lazyIcons ?? [])].sort();
  const registry = new SourceRegistry(options.sources);
  const states = new Map<string, EnvState>();

  let base = "/";
  let dtsPath: string | false = false;
  let excludedPaths = new Set<string>();
  let spriteVersion = 0;
  let lazyVersion = 0;

  function stateFor(environment: { name: string }): EnvState {
    // Keyed per environment; harnesses without a name share one key consistently.
    const key = `${environment.name}`;
    let state = states.get(key);
    if (!state) {
      state = { files: new Map(), warned: new Set(), spriteRef: null, lazyRef: null, spriteRequested: false };
      states.set(key, state);
    }
    return state;
  }

  function manifestFor(state: EnvState): { sprite: string[]; lazy: string[] } {
    const collected = new Set<string>();
    for (const file of state.files.values()) {
      for (const name of file.names) collected.add(name);
    }
    const available = registry.names();
    return buildManifest({
      collected,
      includeExpanded: expandPatterns(includePatterns, available),
      lazyExpanded: expandPatterns(lazyPatterns, available),
    });
  }

  function snapshot(state: EnvState): string {
    const manifest = manifestFor(state);
    return `${manifest.sprite.join("\0")}\n${manifest.lazy.join("\0")}`;
  }

  function checkCollisions(): void {
    if (options.allowOverrides) return;
    const collisions = registry.collisions();
    if (collisions.size === 0) return;
    const sample = [...collisions.keys()]
      .sort()
      .slice(0, 10)
      .map((name) => `"${name}"`)
      .join(", ");
    throw new Error(`znaki: icon name collision for ${sample} provided by multiple sources — set allowOverrides to keep first-source wins`);
  }

  function reportExplicitMissing(state: EnvState, mode: string, warn: (message: string) => void): void {
    if (includePatterns.length === 0 && lazyPatterns.length === 0) return;
    const available = new Set(registry.names());
    const missing = [...missingExact(includePatterns, available), ...missingExact(lazyPatterns, available)];
    for (const name of missing) {
      if (mode === "dev") {
        const key = `explicit\0${name}`;
        if (state.warned.has(key)) continue;
        state.warned.add(key);
        warn(`znaki: icon "${name}" not found in any configured source`);
      } else {
        throw new Error(`znaki: icon "${name}" not found in any configured source`);
      }
    }
  }

  function accepts(id: string): boolean {
    if (id.includes("?") || id.includes("\0")) return false;
    return SOURCE_FILE_RE.test(id);
  }

  function record(state: EnvState, id: string, code: string, mode: string, warn: (message: string) => void): TransformAnalysis | null {
    const names = new Set<string>();
    let dynamic = false;
    let analysis: TransformAnalysis | null = null;

    if (SOURCE_FILE_RE.test(id)) {
      const compiled = compileIcons(code, id);
      if (compiled) {
        for (const name of compiled.names) names.add(name);
        dynamic = dynamic || compiled.dynamic;
        analysis = { code: compiled.code, map: compiled.map };
      }
    }

    const known = new Set<string>();
    for (const name of names) {
      if (registry.resolve(name)) {
        known.add(name);
        continue;
      }
      if (mode === "dev") {
        const key = `${id}\0${name}`;
        if (!state.warned.has(key)) {
          state.warned.add(key);
          warn(`znaki: icon "${name}" not found in any configured source`);
        }
      } else {
        throw new Error(`znaki: icon "${name}" used in ${id} not found in any configured source`);
      }
    }

    if (known.size > 0 || dynamic) state.files.set(id, { names: known, dynamic });
    else state.files.delete(id);

    return analysis;
  }

  async function collectDir(dir: string, state: EnvState, mode: string, warn: (message: string) => void): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (SKIPPED_DIRS[entry.name] || entry.name.startsWith(".") || entry.isSymbolicLink()) return;
        const full = normalizePath(resolve(dir, entry.name));
        if (excludedPaths.has(full)) return;
        if (entry.isDirectory()) {
          await collectDir(full, state, mode, warn);
          return;
        }
        if (accepts(full)) {
          let code: string;
          try {
            code = await readFile(full, "utf-8");
          } catch {
            return;
          }
          record(state, full, code, mode, warn);
        }
      }),
    );
  }

  function finishHotUpdate(
    state: EnvState,
    environment: { moduleGraph: EnvironmentModuleGraph },
    before: string,
    modules: unknown,
  ): EnvironmentModuleNode[] {
    const after = snapshot(state);
    const pending = modules as EnvironmentModuleNode[];
    if (after === before) return [...pending];
    const [beforeSprite, beforeLazy] = before.split("\n");
    const [afterSprite, afterLazy] = after.split("\n");
    if (afterSprite !== beforeSprite) spriteVersion += 1;
    if (afterLazy !== beforeLazy) lazyVersion += 1;
    return [...pending, ...invalidateVirtual(environment)];
  }

  return {
    name: "znaki",
    enforce: "pre",

    configResolved(config) {
      base = config.base;
      dtsPath = options.dts === false ? false : resolve(config.root, options.dts ?? "znaki.d.ts");
      excludedPaths = new Set([config.build.outDir, ...(options.exclude ?? [])].map((dir) => normalizePath(resolve(config.root, dir))));
    },

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = devAssetRequest(request.url, base);
        if (!asset) {
          next();
          return;
        }
        response.setHeader("Content-Type", "image/svg+xml");
        response.setHeader("Cache-Control", "no-cache");
        const state = states.get("client") ?? [...states.values()][0];
        const manifest = state ? manifestFor(state) : { sprite: [], lazy: [] };
        const names = asset === "sprite" ? manifest.sprite : manifest.lazy;
        response.end(spriteMarkup(collectEntries(registry, names)));
      });
    },

    async buildStart() {
      const state: EnvState = { files: new Map(), warned: new Set(), spriteRef: null, lazyRef: null, spriteRequested: false };
      states.set(`${this.environment.name}`, state);
      const root = this.environment.config.root;
      const mode = this.environment.mode;
      registry.init(root);
      checkCollisions();
      if (dtsPath) writeDts(dtsPath, registry.names());
      reportExplicitMissing(state, mode, (message) => this.warn(message));
      const warn = (message: string): void => this.warn(message);
      await Promise.all(
        (options.include ?? [root]).map(async (dir) => {
          const full = normalizePath(resolve(root, dir));
          if (existsSync(full)) await collectDir(full, state, mode, warn);
        }),
      );
      for (const dir of registry.watchDirs) this.addWatchFile(dir);
    },

    resolveId(id) {
      if (id === SPRITE_ID) return SPRITE_RESOLVED;
      return null;
    },

    load(id) {
      const state = stateFor(this.environment);
      const mode = this.environment.mode;
      if (id === SPRITE_RESOLVED) {
        const manifest = manifestFor(state);
        if (mode === "dev") {
          return spriteModuleCode(
            JSON.stringify(`${base}${DEV_SPRITE_PATH.slice(1)}?v=${spriteVersion}`),
            JSON.stringify(`${base}${DEV_LAZY_PATH.slice(1)}?v=${lazyVersion}`),
            manifest.sprite,
            manifest.lazy,
          );
        }
        state.spriteRequested = true;
        return spriteModuleCode(JSON.stringify(SPRITE_URL_TOKEN), JSON.stringify(LAZY_URL_TOKEN), null, null);
      }
      return null;
    },

    transform(code, id) {
      const path = normalizePath(id);
      if (!accepts(path) || path.split("/").includes("node_modules")) return null;
      const state = stateFor(this.environment);
      const mode = this.environment.mode;
      const before = snapshot(state);
      const analysis = record(state, path, code, mode, (message) => this.warn(message));
      const after = snapshot(state);
      if (mode === "dev" && after !== before) {
        const [beforeSprite, beforeLazy] = before.split("\n");
        const [afterSprite, afterLazy] = after.split("\n");
        if (afterSprite !== beforeSprite) spriteVersion += 1;
        if (afterLazy !== beforeLazy) lazyVersion += 1;
        invalidateVirtual(this.environment);
      }
      if (!analysis) return null;
      return { code: analysis.code, map: analysis.map };
    },

    renderStart() {
      if (this.environment.mode === "dev") return;
      const state = states.get(`${this.environment.name}`);
      if (!state?.spriteRequested) return;
      const manifest = manifestFor(state);
      state.spriteRef = this.emitFile({
        type: "asset",
        name: "znaki-sprite.svg",
        source: spriteMarkup(collectEntries(registry, manifest.sprite)),
      });
      state.lazyRef = this.emitFile({
        type: "asset",
        name: "znaki-lazy.svg",
        source: spriteMarkup(collectEntries(registry, manifest.lazy)),
      });
    },

    renderChunk(code, chunk) {
      // Fill JSON.parse("marker") payloads before chunk hashes are computed, so
      // transform order never changes delivery.
      if (this.environment.mode === "dev") return null;
      if (!code.includes("__ZNAKI_")) return null;
      const state = states.get(`${this.environment.name}`);
      if (!state) return null;
      const manifest = manifestFor(state);
      const output = new MagicString(code);
      let touched = inject(output, code, JSON.stringify(SPRITE_TOKEN), JSON.stringify(JSON.stringify(manifest.sprite)));
      touched = inject(output, code, JSON.stringify(LAZY_TOKEN), JSON.stringify(JSON.stringify(manifest.lazy))) || touched;
      if (state.spriteRef) {
        touched = inject(output, code, JSON.stringify(SPRITE_URL_TOKEN), assetUrl(this, state.spriteRef, chunk.fileName, base)) || touched;
      }
      if (state.lazyRef) {
        touched = inject(output, code, JSON.stringify(LAZY_URL_TOKEN), assetUrl(this, state.lazyRef, chunk.fileName, base)) || touched;
      }
      if (!touched) return null;
      return { code: output.toString(), map: output.generateMap({ source: chunk.fileName, hires: true, includeContent: true }) };
    },

    hotUpdate({ file, read, modules }) {
      const path = normalizePath(file);
      const environment = this.environment;
      const state = stateFor(environment);
      const fromSourceDir = registry.watchDirs.some((dir) => path === dir || path.startsWith(`${dir}/`));
      if (!fromSourceDir && (!accepts(path) || path.split("/").includes("node_modules"))) return;
      const warn = (message: string): void => this.warn(message);

      if (fromSourceDir) {
        return (async () => {
          registry.init(environment.config.root);
          state.warned.clear();
          checkCollisions();
          if (dtsPath) writeDts(dtsPath, registry.names());
          reportExplicitMissing(state, environment.mode, warn);
          await Promise.all(
            [...state.files.keys()].map(async (tracked) => {
              let code: string;
              try {
                code = await readFile(tracked, "utf-8");
              } catch {
                state.files.delete(tracked);
                return;
              }
              record(state, tracked, code, environment.mode, warn);
            }),
          );
          // Source content can change invisibly to name snapshots (same names,
          // new geometry), so force fresh asset URLs and invalidate the sprite module.
          spriteVersion += 1;
          lazyVersion += 1;
          return [...(modules as EnvironmentModuleNode[]), ...invalidateVirtual(environment)];
        })();
      }

      return Promise.resolve(read()).then((code) => {
        const before = snapshot(state);
        record(state, path, code, environment.mode, warn);
        return finishHotUpdate(state, environment, before, modules);
      });
    },
  };
}

function devAssetRequest(url: string | undefined, base: string): "sprite" | "lazy" | null {
  if (!url) return null;
  const path = url.split("?")[0];
  const prefix = base.replace(/\/$/, "");
  if (path === DEV_SPRITE_PATH || path === `${prefix}${DEV_SPRITE_PATH}`) return "sprite";
  if (path === DEV_LAZY_PATH || path === `${prefix}${DEV_LAZY_PATH}`) return "lazy";
  return null;
}

function assetUrl(context: { getFileName(referenceId: string): string }, referenceId: string, chunkFileName: string, base: string): string {
  const fileName = context.getFileName(referenceId);
  if (base === "" || base === "./") {
    return `new URL(${JSON.stringify(posix.relative(posix.dirname(chunkFileName), fileName))}, import.meta.url).href`;
  }
  return JSON.stringify(`${base}${fileName}`);
}

function inject(output: MagicString, source: string, search: string, replacement: string): boolean {
  let found = false;
  let from = 0;
  for (;;) {
    const start = source.indexOf(search, from);
    if (start === -1) return found;
    output.overwrite(start, start + search.length, replacement);
    found = true;
    from = start + search.length;
  }
}

function invalidateVirtual(environment: { moduleGraph: EnvironmentModuleGraph }): EnvironmentModuleNode[] {
  const sprite = environment.moduleGraph.getModuleById(SPRITE_RESOLVED);
  if (!sprite) return [];
  environment.moduleGraph.invalidateModule(sprite);
  return [sprite];
}
