import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizePath } from "vite";
import type { EnvironmentModuleNode, Plugin } from "vite";

import { shardKey, symbolId } from "../id.ts";
import type { IconData } from "../types.ts";
import { writeDts } from "./dts.ts";
import {
  ICON_PREFIX_RESOLVED,
  iconName,
  REGISTRY_ID,
  REGISTRY_RESOLVED,
  SHARD_PREFIX_RESOLVED,
  shardId,
  shardName,
  SPRITE_ID,
  SPRITE_RESOLVED,
} from "./ids.ts";
import { scanIcons, scanLiterals } from "./scan.ts";
import type { IconSource } from "./source.ts";
import { SourceRegistry } from "./source.ts";

export { local } from "./sources/local.ts";
export type { LocalOptions } from "./sources/local.ts";
export { tabler } from "./sources/tabler.ts";
export type { TablerOptions, TablerVariant } from "./sources/tabler.ts";
export type { IconSource } from "./source.ts";

const SOURCE_FILE_RE = /\.[tj]sx$/;
const DEV_SPRITE_PATH = "/@znaki/sprite.svg";
const SKIPPED_DIRS = new Set(["node_modules", "dist", "build", "coverage", "storybook-static"]);

export interface ZnakiOptions {
  sources: IconSource[];
  component?: string;
  dynamic?: string[];
  dts?: string | false;
  include?: string[];
  exclude?: string[];
}

interface FileIcons {
  names: Set<string>;
  literals: Set<string>;
  prefixes: Set<string>;
  dynamic: boolean;
}

export default function znaki(options: ZnakiOptions): Plugin {
  const component = options.component ?? "Icon";
  const componentRe = new RegExp(`<${escapeRegex(component)}\\b`);
  const registry = new SourceRegistry(options.sources);
  const byFile = new Map<string, FileIcons>();
  const warned = new Set<string>();
  const loadedShards = new Set<string>();

  let dtsPath: string | false = false;
  let excludedPaths = new Set<string>();
  let base = "/";
  let spriteRef: string | null = null;
  let spriteVersion = 0;

  function spriteNames(): Set<string> {
    const dynamic = anyDynamic();
    const names = new Set<string>();
    for (const file of byFile.values()) {
      for (const name of file.names) names.add(name);
      if (dynamic) for (const name of file.literals) names.add(name);
    }
    return names;
  }

  function dynamicPrefixes(): string[] {
    if (!anyDynamic()) return [];
    const prefixes = new Set(options.dynamic);
    for (const file of byFile.values()) for (const prefix of file.prefixes) prefixes.add(prefix);
    return [...prefixes].sort();
  }

  function dynamicNames(): string[] {
    const allowed = dynamicPrefixes();
    if (allowed.length === 0) return [];
    const sprite = spriteNames();
    return registry.names().filter((name) => !sprite.has(name) && allowed.some((entry) => name.startsWith(entry)));
  }

  function snapshot(): Snapshot {
    const sprite = [...spriteNames()].sort().join("\0");
    return { sprite, registry: anyDynamic() ? `${sprite}\n${dynamicPrefixes().join("\0")}` : "" };
  }

  function anyDynamic(): boolean {
    for (const file of byFile.values()) if (file.dynamic) return true;
    return false;
  }

  function record(id: string, code: string, warn: (msg: string) => void): void {
    const names = new Set<string>();
    let dynamic = false;
    if (componentRe.test(code)) {
      const scanned = scanIcons(code, component);
      dynamic = scanned.dynamic;
      for (const name of scanned.names) {
        if (registry.resolve(name)) names.add(name);
        else if (!warned.has(`${id}\0${name}`)) {
          warned.add(`${id}\0${name}`);
          warn(`znaki: icon "${name}" not found in any configured source`);
        }
      }
    }

    const scanned = scanLiterals(code);
    const literals = new Set([...scanned.strings].filter((value) => registry.has(value)));
    const prefixes = new Set([...scanned.prefixes].filter((prefix) => registry.names().some((name) => name.startsWith(prefix))));

    if (names.size > 0 || dynamic || literals.size > 0 || prefixes.size > 0) byFile.set(id, { names, literals, prefixes, dynamic });
    else byFile.delete(id);
  }

  async function collectDir(dir: string, warn: (msg: string) => void): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (SKIPPED_DIRS.has(entry.name) || entry.name.startsWith(".") || entry.isSymbolicLink()) return;
        const full = normalizePath(resolve(dir, entry.name));
        if (excludedPaths.has(full)) return;
        if (entry.isDirectory()) await collectDir(full, warn);
        else if (SOURCE_FILE_RE.test(entry.name)) record(full, await readFile(full, "utf-8"), warn);
      }),
    );
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
        if (!isDevSpriteRequest(request.url, base)) {
          next();
          return;
        }
        response.setHeader("Content-Type", "image/svg+xml");
        response.setHeader("Cache-Control", "no-cache");
        response.end(spriteMarkup(registry, spriteNames()));
      });
    },

    async buildStart() {
      byFile.clear();
      warned.clear();
      loadedShards.clear();
      registry.init(this.environment.config.root);
      spriteRef = null;

      if (dtsPath) writeDts(dtsPath, registry.names());

      const root = this.environment.config.root;
      const warn = (message: string): void => this.warn(message);
      await Promise.all(
        (options.include ?? [root]).map(async (dir) => {
          const full = normalizePath(resolve(root, dir));
          if (existsSync(full)) await collectDir(full, warn);
        }),
      );

      for (const dir of registry.watchDirs) this.addWatchFile(dir);
    },

    resolveId(id) {
      if (id === SPRITE_ID) return SPRITE_RESOLVED;
      if (id === REGISTRY_ID) return REGISTRY_RESOLVED;
      if (id.startsWith("virtual:znaki/icon/") || id.startsWith("virtual:znaki/shard/")) return `\0${id}`;
      return null;
    },

    load(id) {
      if (id === SPRITE_RESOLVED) {
        const names = [...spriteNames()].map((name) => JSON.stringify(name)).join(", ");
        let url: string;
        if (this.environment.mode === "dev") {
          url = JSON.stringify(`${base}${DEV_SPRITE_PATH.slice(1)}?v=${spriteVersion}`);
        } else {
          spriteRef ??= this.emitFile({
            type: "asset",
            name: "znaki-sprite.svg",
            source: spriteMarkup(registry, spriteNames()),
          });
          url = `import.meta.ROLLUP_FILE_URL_${spriteRef}`;
        }
        return `export const spriteUrl = ${url};\nexport const staticNames = new Set([${names}]);\n`;
      }
      if (id === REGISTRY_RESOLVED) return buildRegistry(dynamicNames());
      if (id.startsWith(SHARD_PREFIX_RESOLVED)) {
        const key = shardName(id);
        loadedShards.add(key);
        return buildShard(
          registry,
          dynamicNames().filter((name) => shardKey(name) === key),
        );
      }
      if (id.startsWith(ICON_PREFIX_RESOLVED)) {
        const data = registry.resolve(iconName(id));
        return data ? `export default ${JSON.stringify(data)};\n` : null;
      }
      return null;
    },

    transform(code, id) {
      if (!SOURCE_FILE_RE.test(id) || id.includes("node_modules")) return null;

      const before = spriteNames();
      const stateBefore = snapshot();
      record(id, code, (message) => this.warn(message));

      const after = spriteNames();
      const stateAfter = snapshot();
      const registryChanged = stateBefore.registry !== stateAfter.registry;
      if (this.environment.mode === "dev" && (stateBefore.sprite !== stateAfter.sprite || registryChanged)) {
        if (stateBefore.sprite !== stateAfter.sprite) spriteVersion += 1;
        invalidateVirtual(this.environment, loadedShards, registryChanged);
      }

      if (spriteRef) {
        const late = [...after].filter((name) => !before.has(name));
        if (late.length > 0) {
          this.warn(
            `znaki: ${late.map((name) => `"${name}"`).join(", ")} found in ${id} after the sprite was emitted — add its directory to "include"`,
          );
        }
      }

      return null;
    },

    hotUpdate({ file, read, modules }) {
      const fromSourceDir = registry.watchDirs.some((dir) => normalizePath(file).startsWith(`${dir}/`));
      if (!fromSourceDir && (!SOURCE_FILE_RE.test(file) || file.includes("node_modules"))) return;

      if (fromSourceDir) {
        registry.invalidate();
        warned.clear();
        if (dtsPath) writeDts(dtsPath, registry.names());
      }

      const stateBefore = snapshot();

      const finish = (): EnvironmentModuleNode[] => {
        const stateAfter = snapshot();
        if (!fromSourceDir && stateBefore.sprite === stateAfter.sprite && stateBefore.registry === stateAfter.registry) return [...modules];

        const registryChanged = stateBefore.registry !== stateAfter.registry || (fromSourceDir && anyDynamic());
        if (fromSourceDir || stateBefore.sprite !== stateAfter.sprite) spriteVersion += 1;
        return [...modules, ...invalidateVirtual(this.environment, loadedShards, registryChanged)];
      };

      if (fromSourceDir) return finish();
      return Promise.resolve(read()).then((code) => {
        record(file, code, (message) => this.warn(message));
        return finish();
      });
    },
  };
}

function isDevSpriteRequest(url: string | undefined, base: string): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  const withBase = `${base.replace(/\/$/, "")}${DEV_SPRITE_PATH}`;
  return path === DEV_SPRITE_PATH || path === withBase;
}

interface Snapshot {
  sprite: string;
  registry: string;
}

function invalidateVirtual(
  environment: { moduleGraph: import("vite").EnvironmentModuleGraph },
  shards: Set<string>,
  registryChanged: boolean,
): EnvironmentModuleNode[] {
  const affected: EnvironmentModuleNode[] = [];
  const sprite = environment.moduleGraph.getModuleById(SPRITE_RESOLVED);
  if (sprite) {
    environment.moduleGraph.invalidateModule(sprite);
    affected.push(sprite);
  }
  if (registryChanged) {
    for (const id of [REGISTRY_RESOLVED, ...[...shards].map((key) => `\0${shardId(key)}`)]) {
      const module = environment.moduleGraph.getModuleById(id);
      if (module) {
        environment.moduleGraph.invalidateModule(module);
        affected.push(module);
      }
    }
  }
  return affected;
}

function spriteMarkup(registry: SourceRegistry, names: Set<string>): string {
  const symbols = [...names]
    .map((name) => {
      const data = registry.resolve(name);
      return data ? symbolMarkup(name, data) : "";
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${symbols}</svg>`;
}

function symbolMarkup(name: string, data: IconData): string {
  const attrs = Object.entries(data.attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");
  const id = symbolId(name);
  return `<symbol id="${id}" viewBox="${escapeAttr(data.viewBox)}"${attrs}>${prefixIds(data.body, id)}</symbol>`;
}

const INNER_ID_RE = /\bid="([^"]+)"/g;

function prefixIds(body: string, prefix: string): string {
  const ids = [...body.matchAll(INNER_ID_RE)].map((match) => match[1]);
  let result = body;
  for (const id of new Set(ids)) {
    const escaped = escapeRegex(id);
    result = result
      .replaceAll(new RegExp(`\\bid="${escaped}"`, "g"), `id="${prefix}-${id}"`)
      .replaceAll(new RegExp(`url\\(\\s*#${escaped}\\s*\\)`, "g"), `url(#${prefix}-${id})`)
      .replaceAll(new RegExp(`href="#${escaped}"`, "g"), `href="#${prefix}-${id}"`);
  }
  return result;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegistry(names: string[]): string {
  const keys = [...new Set(names.map((name) => shardKey(name)))].sort();
  const lines = keys.map((key) => `  ${JSON.stringify(key)}: () => import(${JSON.stringify(shardId(key))}),`);
  return `export const shards = {\n${lines.join("\n")}\n};\n`;
}

function buildShard(registry: SourceRegistry, names: string[]): string {
  const entries = names
    .map((name) => {
      const data = registry.resolve(name);
      return data ? `  ${JSON.stringify(name)}: ${JSON.stringify(data)},` : "";
    })
    .filter(Boolean);
  return `export default {\n${entries.join("\n")}\n};\n`;
}
