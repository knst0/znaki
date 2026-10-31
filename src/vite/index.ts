import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { posix, resolve } from "node:path";

import MagicString from "magic-string";
import type { SourceMap } from "magic-string";
import { normalizePath } from "vite";
import type { EnvironmentModuleGraph, EnvironmentModuleNode, Plugin, ViteDevServer } from "vite";

import {
  collectEntries,
  inlineModuleCode,
  INLINE_TOKEN,
  LAZY_TOKEN,
  LAZY_URL_TOKEN,
  spriteModuleCode,
  SPRITE_MARKUP_TOKEN,
  SPRITE_TOKEN,
  SPRITE_URL_TOKEN,
} from "./artifacts.ts";
import { compileIcons } from "./compiler.ts";
import type { CompileIconsOptions } from "./compiler.ts";
import { writeDts } from "./dts.ts";
import { INLINE_ID, INLINE_RESOLVED, SPRITE_ID, SPRITE_RESOLVED } from "./ids.ts";
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
  let compileOptions: CompileIconsOptions = {};
  let server: ViteDevServer | null = null;
  // Files rendering `<PreloadSprite inline />`, shared by every environment: the
  // document that inlines the sprite may be server-only, yet client icons must
  // agree on same-document hrefs.
  const inlineFiles = new Set<string>();

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

  function manifestFor(...envs: EnvState[]): { sprite: string[]; lazy: string[] } {
    const collected = new Set<string>();
    for (const state of envs) {
      for (const file of state.files.values()) {
        for (const name of file.names) collected.add(name);
      }
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

  function inlineMarkup(...envs: EnvState[]): string {
    return spriteMarkup(collectEntries(registry, manifestFor(...envs).sprite));
  }

  /** Re-run `record` while watching for a change of the global inline flag. */
  function recordTracked(
    state: EnvState,
    id: string,
    code: string,
    mode: string,
    warn: (message: string) => void,
  ): { analysis: TransformAnalysis | null; inlineChanged: boolean } {
    const before = inlineFiles.size > 0;
    const analysis = record(state, id, code, mode, warn);
    return { analysis, inlineChanged: before !== inlineFiles.size > 0 };
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
    if (id.includes("\0")) return false;
    const queryStart = id.indexOf("?");
    if (queryStart === -1) return SOURCE_FILE_RE.test(id);
    if (!SOURCE_FILE_RE.test(id.slice(0, queryStart))) return false;
    const query = new URLSearchParams(id.slice(queryStart + 1));
    return !query.has("raw") && !query.has("url");
  }

  function record(state: EnvState, id: string, code: string, mode: string, warn: (message: string) => void): TransformAnalysis | null {
    const names = new Set<string>();
    let dynamic = false;
    let dynamicLocation: string | null = null;
    let analysis: TransformAnalysis | null = null;

    let inline = false;
    if (accepts(id)) {
      const compiled = compileIcons(code, id, compileOptions);
      if (compiled) {
        for (const name of compiled.names) names.add(name);
        dynamic = dynamic || compiled.dynamic;
        dynamicLocation = compiled.dynamicLocation;
        inline = compiled.inline;
        analysis = { code: compiled.code, map: compiled.map };
      }
    }
    if (inline) inlineFiles.add(id.split("?")[0]);
    else inlineFiles.delete(id.split("?")[0]);

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

    if (dynamicLocation !== null && includePatterns.length === 0 && lazyPatterns.length === 0) {
      const pathname = id.split("?")[0];
      const key = `dynamic\0${pathname}`;
      if (!state.warned.has(key)) {
        state.warned.add(key);
        warn(`znaki: dynamic icon name in ${id}:${dynamicLocation} needs includeIcons or lazyIcons to configure delivery`);
      }
    }

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

  /** The inline flag is global, so every environment's sprite module goes stale together. */
  function invalidateEverywhere(current: { moduleGraph: EnvironmentModuleGraph }): EnvironmentModuleNode[] {
    for (const environment of Object.values(server?.environments ?? {})) {
      if (environment.moduleGraph !== current.moduleGraph) invalidateVirtual(environment);
    }
    return invalidateVirtual(current);
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
      const react = (config.plugins ?? []).some((plugin) => plugin.name.startsWith("vite:react"));
      compileOptions = { htmlProp: react ? "dangerouslySetInnerHTML" : "innerHTML" };
      dtsPath = options.dts === false ? false : resolve(config.root, options.dts ?? "znaki.d.ts");
      excludedPaths = new Set([config.build.outDir, ...(options.exclude ?? [])].map((dir) => normalizePath(resolve(config.root, dir))));
    },

    configureServer(devServer) {
      server = devServer;
      devServer.middlewares.use((request, response, next) => {
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
      if (id === INLINE_ID) return INLINE_RESOLVED;
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
            inlineFiles.size > 0,
          );
        }
        state.spriteRequested = true;
        return spriteModuleCode(JSON.stringify(SPRITE_URL_TOKEN), JSON.stringify(LAZY_URL_TOKEN), null, null, null);
      }
      // Dev runs the startup scan in the client environment only, while the
      // inlining document usually renders in SSR: merge every environment.
      if (id === INLINE_RESOLVED) return inlineModuleCode(mode === "dev" ? inlineMarkup(...states.values()) : null);
      return null;
    },

    transform(code, id) {
      const path = normalizePath(id);
      if (!accepts(path) || path.split("/").includes("node_modules")) return null;
      const state = stateFor(this.environment);
      const mode = this.environment.mode;
      const before = snapshot(state);
      const { analysis, inlineChanged } = recordTracked(state, path, code, mode, (message) => this.warn(message));
      const after = snapshot(state);
      if (mode === "dev" && after !== before) {
        const [beforeSprite, beforeLazy] = before.split("\n");
        const [afterSprite, afterLazy] = after.split("\n");
        if (afterSprite !== beforeSprite) spriteVersion += 1;
        if (afterLazy !== beforeLazy) lazyVersion += 1;
        // The merged inline markup is shared, so a discovery anywhere makes it stale everywhere.
        if (afterSprite !== beforeSprite && inlineFiles.size > 0) invalidateEverywhere(this.environment);
        else invalidateVirtual(this.environment);
      }
      if (mode === "dev" && inlineChanged) invalidateEverywhere(this.environment);
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
      touched = inject(output, code, JSON.stringify(INLINE_TOKEN), JSON.stringify(JSON.stringify(inlineFiles.size > 0))) || touched;
      if (code.includes(JSON.stringify(SPRITE_MARKUP_TOKEN))) {
        touched = inject(output, code, JSON.stringify(SPRITE_MARKUP_TOKEN), JSON.stringify(inlineMarkup(state))) || touched;
      }
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
              // Query modules contain transformed selections, not files on disk.
              // Keep their discoveries until Vite transforms that identity again.
              if (tracked.includes("?")) return;
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
        // A source edit invalidates every selection of that file. Each query
        // module will repopulate its own discoveries when transformed again.
        for (const tracked of state.files.keys()) {
          if (tracked.startsWith(`${path}?`)) state.files.delete(tracked);
        }
        const { inlineChanged } = recordTracked(state, path, code, environment.mode, warn);
        const updated = finishHotUpdate(state, environment, before, modules);
        if (!inlineChanged) return updated;
        const stale = invalidateEverywhere(environment).filter((module) => !updated.includes(module));
        return [...updated, ...stale];
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
  const stale: EnvironmentModuleNode[] = [];
  for (const id of [SPRITE_RESOLVED, INLINE_RESOLVED]) {
    const module = environment.moduleGraph.getModuleById(id);
    if (!module) continue;
    environment.moduleGraph.invalidateModule(module);
    stale.push(module);
  }
  return stale;
}
