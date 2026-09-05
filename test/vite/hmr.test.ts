import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { local } from "../../src/vite/sources/local.ts";
import { SVG } from "../fixtures/icons.ts";
import { useProject } from "../fixtures/project.ts";
import { createHotHarness, resolveId } from "../helpers/hot.ts";
import type { HotHarness, HotParams } from "../helpers/hot.ts";

const project = useProject("znaki-hot");

let iconDir: string;

beforeEach(() => {
  iconDir = join(project.root, "icons");
  mkdirSync(iconDir, { recursive: true });
  writeFileSync(join(iconDir, "home.svg"), SVG);
});

function harness(options: HotParams["options"] = {}): HotHarness {
  const h = createHotHarness({ root: project.root, sources: [local({ dir: iconDir })], options });
  h.configResolved();
  h.buildStart();
  return h;
}

describe("hotUpdate: source files", () => {
  it("invalidates the sprite module when a file gains an icon", async () => {
    project.file("main.tsx", `export const C = () => <div />;`);
    const h = harness();

    await h.hotUpdate(join(project.root, "main.tsx"), `export const C = () => <Icon name="local:home" />;`);

    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
    expect(h.load("\0virtual:znaki/sprite")).toContain('"local:home"');
  });

  it("does not invalidate when the icon set is unchanged", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();

    await h.hotUpdate(join(project.root, "main.tsx"), `export const C = () => <Icon name="local:home" class="x" />;`);

    expect(h.invalidated).toEqual([]);
  });

  it("invalidates the registry only when dynamic usage appears", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();

    await h.hotUpdate(join(project.root, "main.tsx"), `export const C = (p) => <Icon name={p.n} />;`);

    expect(h.invalidated).toContain("\0virtual:znaki/registry");
    expect(h.load("\0virtual:znaki/registry")).toContain('"local-ho"');
  });

  it("removes icons when a file stops using the component", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();

    await h.hotUpdate(join(project.root, "main.tsx"), `export const C = () => <div />;`);

    expect(h.load("\0virtual:znaki/sprite")).toContain("new Set([])");
  });

  it("ignores files that are not source files or live in node_modules", async () => {
    const h = harness();

    expect(await h.hotUpdate(join(project.root, "styles.css"), "body{}")).toBeUndefined();
    expect(await h.hotUpdate(join(project.root, "node_modules", "a.tsx"), `<Icon name="local:home" />`)).toBeUndefined();
  });
});

describe("hotUpdate: icon directories", () => {
  it("picks up an icon added to a watched source dir", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="local:added" />;`);
    const h = harness();

    expect(h.load("\0virtual:znaki/sprite")).toContain("new Set([])");
    expect(h.warnings.join("\n")).toContain(`icon "local:added" not found`);

    writeFileSync(join(iconDir, "added.svg"), SVG);
    await h.hotUpdate(join(iconDir, "added.svg"), SVG);

    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
  });

  it("rewrites the dts when the icon dir changes", async () => {
    project.file("main.tsx", `export const C = () => <div />;`);
    const dts = join(project.root, "znaki.d.ts");
    const h = harness({ dts: "znaki.d.ts" });

    expect(readFileSync(dts, "utf-8")).not.toContain("added");

    writeFileSync(join(iconDir, "added.svg"), SVG);
    await h.hotUpdate(join(iconDir, "added.svg"), SVG);

    expect(readFileSync(dts, "utf-8")).toContain('"local:added"');
  });

  it("always invalidates the sprite for a source dir change", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();

    await h.hotUpdate(join(iconDir, "home.svg"), SVG);

    expect(h.invalidated).toEqual(["\0virtual:znaki/sprite"]);
  });
});

describe("buildStart", () => {
  it("resets state between builds", () => {
    project.file("main.tsx", `export const C = () => <Icon name="local:home" />;`);
    const h = harness();

    expect(h.load("\0virtual:znaki/sprite")).toContain('"local:home"');

    rmSync(join(project.root, "main.tsx"));
    h.buildStart();

    expect(h.load("\0virtual:znaki/sprite")).toContain("new Set([])");
  });

  it("warns once per unresolved icon name", () => {
    project.file("main.tsx", `export const C = () => <Icon name="local:nope" />;`);
    const h = harness();

    expect(h.warnings.filter((message) => message.includes("local:nope"))).toHaveLength(1);
  });
});

describe("resolveId", () => {
  it("resolves the sprite, registry and icon ids", () => {
    expect(resolveId("virtual:znaki/sprite")).toBe("\0virtual:znaki/sprite");
    expect(resolveId("virtual:znaki/registry")).toBe("\0virtual:znaki/registry");
    expect(resolveId("virtual:znaki/icon/home")).toBe("\0virtual:znaki/icon/home");
  });

  it("ignores unrelated ids", () => {
    expect(resolveId("./main.tsx")).toBeNull();
    expect(resolveId("virtual:other")).toBeNull();
  });

  it("returns null from load for unknown ids", () => {
    const h = harness();

    expect(h.load("\0virtual:znaki/icon/local%3Anope")).toBeNull();
    expect(h.load("./main.tsx")).toBeNull();
  });
});
