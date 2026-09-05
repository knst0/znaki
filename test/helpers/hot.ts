import znaki from "../../src/vite/index.ts";
import type { ZnakiOptions } from "../../src/vite/index.ts";
import type { IconSource } from "../../src/vite/source.ts";

export interface HotHarness {
  invalidated: string[];
  warnings: string[];
  configResolved: () => void;
  buildStart: () => Promise<void>;
  load: (id: string) => string | null;
  hotUpdate: (file: string, code: string) => Promise<unknown[]> | unknown[];
}

export interface HotParams {
  root: string;
  sources: IconSource[];
  options?: Partial<ZnakiOptions>;
}

export function createHotHarness({ root, sources, options = {} }: HotParams): HotHarness {
  const plugin = znaki({ sources, dts: false, ...options });
  const invalidated: string[] = [];
  const warnings: string[] = [];
  const modules = new Map<string, { id: string }>([
    ["\0virtual:znaki/sprite", { id: "\0virtual:znaki/sprite" }],
    ["\0virtual:znaki/registry", { id: "\0virtual:znaki/registry" }],
  ]);

  const context = {
    environment: {
      mode: "dev",
      config: { root },
      moduleGraph: {
        getModuleById: (id: string) => modules.get(id) ?? null,
        invalidateModule: (module: { id: string }) => invalidated.push(module.id),
      },
    },
    warn: (message: string) => warnings.push(message),
    addWatchFile: () => {},
  };

  const call = <T>(hook: unknown, ...args: unknown[]): T => (hook as (this: unknown, ...a: unknown[]) => T).apply(context, args);

  return {
    invalidated,
    warnings,
    configResolved: () => call(plugin.configResolved, { root, base: "/", build: { outDir: "dist" } }),
    buildStart: () => call<Promise<void>>(plugin.buildStart),
    load: (id) => call<string | null>(plugin.load, id),
    hotUpdate: (file, code) =>
      call<Promise<unknown[]> | unknown[]>(plugin.hotUpdate, {
        file,
        read: () => Promise.resolve(code),
        modules: [],
      }),
  };
}

export function resolveId(id: string): unknown {
  const plugin = znaki({ sources: [], dts: false });
  return (plugin.resolveId as (this: unknown, id: string) => unknown).call({}, id);
}
