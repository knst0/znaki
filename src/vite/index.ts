import { existsSync, readdirSync, readFileSync } from "node:fs";
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
import { scanIcons } from "./scan.ts";
import type { IconSource } from "./source.ts";
import { SourceRegistry } from "./source.ts";

export { local } from "./sources/local.ts";
export type { LocalOptions } from "./sources/local.ts";
export { tabler } from "./sources/tabler.ts";
export type { TablerOptions, TablerVariant } from "./sources/tabler.ts";
export type { IconSource } from "./source.ts";

const SOURCE_FILE_RE = /\.[tj]sx$/;
const DEV_SPRITE_PATH = "/@znaki/sprite.svg";

export interface ZnakiOptions {
  sources: IconSource[];
  component?: string;
  dynamic?: string[];
  dts?: string | false;
  include?: string[];
}

interface FileIcons {
  names: Set<string>;
  dynamic: boolean;
}

export default function znaki(options: ZnakiOptions): Plugin {
  const component = options.component ?? "Icon";
  const componentRe = new RegExp(`<${escapeRegex(component)}\\b`);
  const registry = new SourceRegistry(options.sources);
  const byFile = new Map<string, FileIcons>();
  const warned = new Set<string>();

  let dtsPath: string | false = false;
  let base = "/";
  let spriteRef: string | null = null;
  let spriteVersion = 0;

  function spriteNames(): Set<string> {
    const names = new Set<string>();
    for (const file of byFile.values()) {
      for (const name of file.names) names.add(name);
    }
    return names;
  }

  function dynamicNames(): string[] {
    const allowed = options.dynamic;
    if (!allowed) return registry.names();
    return registry.names().filter((name) => allowed.some((entry) => name === entry || name.startsWith(entry)));
  }

  function anyDynamic(): boolean {
    for (const file of byFile.values()) if (file.dynamic) return true;
    return false;
  }

  function record(id: string, code: string, warn: (msg: string) => void): void {
    if (!componentRe.test(code)) {
      byFile.delete(id);
      return;
    }
    const { names: found, dynamic } = scanIcons(code, component);
    const names = new Set<string>();
    for (const name of found) {
      if (registry.resolve(name)) names.add(name);
      else if (!warned.has(`${id}\0${name}`)) {
        warned.add(`${id}\0${name}`);
        warn(`znaki: icon "${name}" not found in any configured source`);
      }
    }
    if (names.size > 0 || dynamic) byFile.set(id, { names, dynamic });
    else byFile.delete(id);
  }

  function collectDir(dir: string, warn: (msg: string) => void): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
      const full = normalizePath(resolve(dir, entry.name));
      if (entry.isDirectory()) collectDir(full, warn);
      else if (SOURCE_FILE_RE.test(entry.name)) record(full, readFileSync(full, "utf-8"), warn);
    }
  }

  return {
    name: "znaki",
    enforce: "pre",

    configResolved(config) {
      base = config.base;
      dtsPath = options.dts === false ? false : resolve(config.root, options.dts ?? "znaki.d.ts");
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

    buildStart() {
      byFile.clear();
      warned.clear();
      registry.init(this.environment.config.root);
      spriteRef = null;

      if (dtsPath) writeDts(dtsPath, registry.names());

      const root = this.environment.config.root;
      const warn = (message: string): void => this.warn(message);
      for (const dir of options.include ?? [root]) {
        const full = normalizePath(resolve(root, dir));
        if (existsSync(full)) collectDir(full, warn);
      }

      for (const dir of registry.watchDirs) this.addWatchFile(dir);

      if (anyDynamic()) {
        this.warn(`znaki: dynamic <${component} name={...}> found — falling back to the lazy icon registry`);
      }
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
      if (id === REGISTRY_RESOLVED) return buildRegistry(anyDynamic() ? dynamicNames() : []);
      if (id.startsWith(SHARD_PREFIX_RESOLVED)) {
        const key = shardName(id);
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
      const dynamicBefore = anyDynamic();
      record(id, code, (message) => this.warn(message));

      const after = spriteNames();
      if (this.environment.mode === "dev" && changed(before, after, dynamicBefore, anyDynamic())) {
        spriteVersion += 1;
        invalidateVirtual(this.environment, dynamicBefore !== anyDynamic());
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

      const before = spriteNames();
      const dynamicBefore = anyDynamic();

      const finish = (): EnvironmentModuleNode[] => {
        const dynamicChanged = dynamicBefore !== anyDynamic();
        if (!fromSourceDir && !changed(before, spriteNames(), dynamicBefore, anyDynamic())) return [...modules];

        spriteVersion += 1;
        return [...modules, ...invalidateVirtual(this.environment, dynamicChanged)];
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

function changed(before: Set<string>, after: Set<string>, dynamicBefore: boolean, dynamicAfter: boolean): boolean {
  if (dynamicBefore !== dynamicAfter) return true;
  if (before.size !== after.size) return true;
  return [...after].some((name) => !before.has(name));
}

function invalidateVirtual(
  environment: { moduleGraph: import("vite").EnvironmentModuleGraph },
  dynamicChanged: boolean,
): EnvironmentModuleNode[] {
  const affected: EnvironmentModuleNode[] = [];
  const sprite = environment.moduleGraph.getModuleById(SPRITE_RESOLVED);
  if (sprite) {
    environment.moduleGraph.invalidateModule(sprite);
    affected.push(sprite);
  }
  if (dynamicChanged) {
    const registryModule = environment.moduleGraph.getModuleById(REGISTRY_RESOLVED);
    if (registryModule) {
      environment.moduleGraph.invalidateModule(registryModule);
      affected.push(registryModule);
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
