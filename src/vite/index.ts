import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import MagicString from "magic-string";
import type { EnvironmentModuleNode, Plugin } from "vite";

import { symbolId } from "../id.ts";
import type { IconData, IconMode } from "../types.ts";
import { writeDts } from "./dts.ts";
import { ICON_PREFIX_RESOLVED, iconId, iconName, REGISTRY_ID, REGISTRY_RESOLVED, SPRITE_ID, SPRITE_RESOLVED } from "./ids.ts";
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
  mode?: IconMode;
  component?: string;
  dts?: string | false;
  include?: string[];
}

interface FileIcons {
  names: Set<string>;
  dynamic: boolean;
}

export default function znaki(options: ZnakiOptions): Plugin {
  const component = options.component ?? "Icon";
  const componentRe = new RegExp(`<${component}\\b`);
  const registry = new SourceRegistry(options.sources, options.mode ?? "sprite");
  const byFile = new Map<string, FileIcons>();

  let dtsPath: string | false = false;
  let base = "/";
  let spriteRef: string | null = null;
  let spriteVersion = 0;

  function spriteNames(): Set<string> {
    const names = new Set<string>();
    for (const file of byFile.values()) {
      for (const name of file.names) {
        if (registry.resolve(name)?.mode === "sprite") names.add(name);
      }
    }
    return names;
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
      else warn(`znaki: icon "${name}" not found in any configured source`);
    }
    if (names.size > 0 || dynamic) byFile.set(id, { names, dynamic });
    else byFile.delete(id);
  }

  function collectDir(dir: string, warn: (msg: string) => void): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = resolve(dir, entry.name);
      if (statSync(full).isDirectory()) collectDir(full, warn);
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
      server.middlewares.use(DEV_SPRITE_PATH, (_request, response) => {
        response.setHeader("Content-Type", "image/svg+xml");
        response.setHeader("Cache-Control", "no-cache");
        response.end(spriteMarkup(registry, spriteNames()));
      });
    },

    buildStart() {
      byFile.clear();
      registry.init(this.environment.config.root);
      spriteRef = null;

      if (dtsPath) writeDts(dtsPath, registry.names());

      const root = this.environment.config.root;
      const warn = (message: string): void => this.warn(message);
      for (const dir of options.include ?? [root]) {
        const full = resolve(root, dir);
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
      if (id.startsWith("virtual:znaki/icon/")) return `\0${id}`;
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
      if (id === REGISTRY_RESOLVED) return buildRegistry(anyDynamic() ? registry.names() : []);
      if (id.startsWith(ICON_PREFIX_RESOLVED)) {
        const data = registry.resolve(iconName(id))?.data;
        return data ? `export default ${JSON.stringify(data)};\n` : null;
      }
      return null;
    },

    transform(code, id) {
      if (!SOURCE_FILE_RE.test(id) || id.includes("node_modules")) return null;

      const before = spriteNames();
      const dynamicBefore = anyDynamic();
      record(id, code, (message) => this.warn(message));

      if (this.environment.mode === "dev" && changed(before, spriteNames(), dynamicBefore, anyDynamic())) {
        spriteVersion += 1;
        invalidateVirtual(this.environment, dynamicBefore !== anyDynamic());
      }

      return inlineTransform(code, component, registry);
    },

    hotUpdate({ file, read, modules }) {
      const fromSourceDir = registry.watchDirs.some((dir) => file.startsWith(dir));
      if (!fromSourceDir && (!SOURCE_FILE_RE.test(file) || file.includes("node_modules"))) return;

      if (fromSourceDir) {
        registry.invalidate();
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

function inlineTransform(code: string, component: string, registry: SourceRegistry): { code: string; map: null } | null {
  const { sites } = scanIcons(code, component);
  const inlineSites = sites.filter((site) => registry.resolve(site.name)?.mode === "inline");
  if (inlineSites.length === 0) return null;

  const s = new MagicString(code);
  const bindings = new Map<string, string>();
  const declarations: string[] = [];

  for (const site of inlineSites) {
    let binding = bindings.get(site.name);
    if (!binding) {
      binding = `__znaki_${bindings.size}`;
      bindings.set(site.name, binding);
      const data = registry.resolve(site.name)?.data;
      if (data) declarations.push(`const ${binding} = ${iconLiteral(data)};`);
    }
    s.appendLeft(site.insertPos, ` data={${binding}}`);
  }

  s.prepend(`${declarations.join("\n")}\n`);

  return { code: s.toString(), map: null };
}

function iconLiteral(data: IconData): string {
  const attrs = Object.entries(data.attrs)
    .map(([key, value]) => `${JSON.stringify(key)}: ${stringLiteral(value)}`)
    .join(", ");
  return `{ "body": ${stringLiteral(data.body)}, "viewBox": ${stringLiteral(data.viewBox)}, "attrs": { ${attrs} } }`;
}

function stringLiteral(value: string): string {
  return value.includes('"') && !value.includes("'") && !value.includes("\\") ? `'${value}'` : JSON.stringify(value);
}

function spriteMarkup(registry: SourceRegistry, names: Set<string>): string {
  const symbols = [...names]
    .map((name) => {
      const data = registry.resolve(name)?.data;
      return data ? symbolMarkup(name, data) : "";
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols}</svg>`;
}

function symbolMarkup(name: string, data: IconData): string {
  const attrs = Object.entries(data.attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");
  return `<symbol id="${symbolId(name)}" viewBox="${escapeAttr(data.viewBox)}"${attrs}>${data.body}</symbol>`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function buildRegistry(names: string[]): string {
  const lines = names.map((name) => `  ${JSON.stringify(name)}: () => import(${JSON.stringify(iconId(name))}),`);
  return `export const registry = {\n${lines.join("\n")}\n};\n`;
}
