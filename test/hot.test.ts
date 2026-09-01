import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import znaki from "../src/vite/index.ts";
import type { ZnakiOptions } from "../src/vite/index.ts";
import { local } from "../src/vite/sources/local.ts";

const SVG = `<svg viewBox="0 0 16 16"><path/></svg>`;

let root: string;
let iconDir: string;

function file(relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function harness(options: Partial<ZnakiOptions> = {}) {
  const plugin = znaki({ sources: [local({ dir: iconDir })], dts: false, ...options });
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
    configResolved: () => call(plugin.configResolved, { root, base: "/" }),
    buildStart: () => call(plugin.buildStart),
    load: (id: string) => call<string | null>(plugin.load, id),
    hotUpdate: (file: string, code: string) =>
      call<Promise<unknown[]> | unknown[]>(plugin.hotUpdate, {
        file,
        read: () => Promise.resolve(code),
        modules: [],
      }),
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "znaki-hot-"));
  iconDir = join(root, "icons");
  mkdirSync(iconDir, { recursive: true });
  writeFileSync(join(iconDir, "home.svg"), SVG);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("hotUpdate: source files", () => {
  it("invalidates the sprite module when a file gains an icon", async () => {
    file("main.tsx", `export const C = () => <div />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    await h.hotUpdate(join(root, "main.tsx"), `export const C = () => <Icon name="local:home" />;`);

    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
    expect(h.load("\0virtual:znaki/sprite")).toContain('"local:home"');
  });

  it("does not invalidate when the icon set is unchanged", async () => {
    file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    await h.hotUpdate(join(root, "main.tsx"), `export const C = () => <Icon name="local:home" class="x" />;`);

    expect(h.invalidated).toEqual([]);
  });

  it("invalidates the registry only when dynamic usage appears", async () => {
    file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    await h.hotUpdate(join(root, "main.tsx"), `export const C = (p) => <Icon name={p.n} />;`);

    expect(h.invalidated).toContain("\0virtual:znaki/registry");
    expect(h.load("\0virtual:znaki/registry")).toContain('"local:home"');
  });

  it("removes icons when a file stops using the component", async () => {
    file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    await h.hotUpdate(join(root, "main.tsx"), `export const C = () => <div />;`);

    expect(h.load("\0virtual:znaki/sprite")).toContain("new Set([])");
  });

  it("ignores files that are not source files or live in node_modules", async () => {
    const h = harness();
    h.configResolved();
    h.buildStart();

    expect(await h.hotUpdate(join(root, "styles.css"), "body{}")).toBeUndefined();
    expect(await h.hotUpdate(join(root, "node_modules", "a.tsx"), `<Icon name="local:home" />`)).toBeUndefined();
  });
});

describe("hotUpdate: icon directories", () => {
  it("picks up an icon added to a watched source dir", async () => {
    file("main.tsx", `export const C = () => <Icon name="local:added" />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    expect(h.load("\0virtual:znaki/sprite")).toContain("new Set([])");
    expect(h.warnings.join("\n")).toContain(`icon "local:added" not found`);

    writeFileSync(join(iconDir, "added.svg"), SVG);
    await h.hotUpdate(join(iconDir, "added.svg"), SVG);

    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
  });

  it("rewrites the dts when the icon dir changes", async () => {
    file("main.tsx", `export const C = () => <div />;`);
    const dts = join(root, "znaki.d.ts");
    const h = harness({ dts: "znaki.d.ts" });
    h.configResolved();
    h.buildStart();

    expect(readFileSync(dts, "utf-8")).not.toContain("added");

    writeFileSync(join(iconDir, "added.svg"), SVG);
    await h.hotUpdate(join(iconDir, "added.svg"), SVG);

    expect(readFileSync(dts, "utf-8")).toContain('"local:added"');
  });

  it("always invalidates the sprite for a source dir change", async () => {
    file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    await h.hotUpdate(join(iconDir, "home.svg"), SVG);

    expect(h.invalidated).toEqual(["\0virtual:znaki/sprite"]);
  });
});

describe("buildStart", () => {
  it("resets state between builds", () => {
    file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    expect(h.load("\0virtual:znaki/sprite")).toContain('"local:home"');

    rmSync(join(root, "main.tsx"));
    h.buildStart();

    expect(h.load("\0virtual:znaki/sprite")).toContain("new Set([])");
  });

  it("warns once per unresolved icon name", () => {
    file("main.tsx", `export const C = () => <Icon name="local:nope" />;`);
    const h = harness();
    h.configResolved();
    h.buildStart();

    expect(h.warnings.filter((message) => message.includes("local:nope"))).toHaveLength(1);
  });
});

describe("resolveId", () => {
  const plugin = () => znaki({ sources: [], dts: false });
  const resolve_ = (id: string): unknown => (plugin().resolveId as (this: unknown, id: string) => unknown).call({}, id);

  it("resolves the sprite, registry and icon ids", () => {
    expect(resolve_("virtual:znaki/sprite")).toBe("\0virtual:znaki/sprite");
    expect(resolve_("virtual:znaki/registry")).toBe("\0virtual:znaki/registry");
    expect(resolve_("virtual:znaki/icon/home")).toBe("\0virtual:znaki/icon/home");
  });

  it("ignores unrelated ids", () => {
    expect(resolve_("./main.tsx")).toBeNull();
    expect(resolve_("virtual:other")).toBeNull();
  });

  it("returns null from load for unknown ids", () => {
    const h = harness();
    h.configResolved();
    h.buildStart();

    expect(h.load("\0virtual:znaki/icon/local%3Anope")).toBeNull();
    expect(h.load("./main.tsx")).toBeNull();
  });
});
