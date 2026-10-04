import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { ICONS } from "../fixtures/icons.ts";
import { useProject } from "../fixtures/project.ts";
import { fakeSource, memorySource } from "../fixtures/sources.ts";
import { buildProject } from "../helpers/build.ts";
import type { ZnakiOptions } from "../helpers/build.ts";

const project = useProject("znaki-build");
const bundle = (options: ZnakiOptions, entry?: string) => buildProject({ root: project.root, options, entry });
const symbols = (markup: string) => {
  const window = new Window();
  return new window.DOMParser().parseFromString(markup, "image/svg+xml").querySelectorAll("symbol");
};

describe("production manifest", () => {
  it("collects imported intrinsic aliases, not unrelated components or string literals", async () => {
    project.file(
      "main.tsx",
      `import { Icon as Glyph } from "znaki";
      const Icon = () => null;
      export const label = "i:user";
      export const C = () => <><Glyph name="i:home"/><Icon name="i:user"/></>;`,
    );
    const { sprite } = await bundle({ sources: [memorySource()], dts: false });
    const found = symbols(sprite);
    expect(found).toHaveLength(1);
    expect(found[0].getAttribute("viewBox")).toBe("0 0 16 16");
    expect(found[0].querySelector("path")?.getAttribute("d")).toBe("M1 1");
  });

  it("finalizes the sprite after imported files outside initial scan directories", async () => {
    project.file("main.tsx", `export { C } from "./outside/view.tsx"; export * from "virtual:znaki/sprite";`);
    project.file("outside/view.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="i:user"/>;`);
    const { sprite } = await bundle({ sources: [memorySource()], include: ["empty"], dts: false });
    const found = symbols(sprite);
    expect(found).toHaveLength(1);
    expect(found[0].querySelector("circle")).not.toBeNull();
  });

  it("uses explicit exact names and wildcard patterns, without literal harvesting", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite"; export const unrelated = "i:user";`);
    const source = fakeSource("i", { ...ICONS, "home-extra": ICONS.user, "arrow-left": ICONS.quoted });
    const { sprite } = await bundle({ sources: [source], includeIcons: ["i:home", "i:arrow-*"], dts: false });
    const found = symbols(sprite);
    expect(found).toHaveLength(2);
    expect(found[0].parentElement?.querySelector("circle")).toBeNull();
    expect([...found].map((node) => node.getAttribute("viewBox") ?? "").sort()).toEqual(["0 0 16 16", "0 0 2 2"]);
  });

  it("escapes source attributes without changing their decoded value", async () => {
    project.file("main.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="i:quoted"/>;`);
    const { sprite } = await bundle({ sources: [memorySource()], dts: false });
    expect(symbols(sprite)[0].getAttribute("title")).toBe('a "b" & <c>');
  });

  it("emits a valid empty sprite when only the URL is requested", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    expect(symbols((await bundle({ sources: [memorySource()], dts: false })).sprite)).toHaveLength(0);
  });
});

describe("lazy delivery", () => {
  it("includes explicitly lazy icons even without a dynamic component and excludes sprite icons", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/registry"; export * from "virtual:znaki/sprite";`);
    const { output, sprite } = await bundle({ sources: [memorySource()], includeIcons: ["i:home"], lazyIcons: ["i:*"], dts: false });
    const chunks = output.filter((item) => item.type === "chunk" && item.isDynamicEntry);
    const entries: Record<string, unknown> = {};
    for (const chunk of chunks) {
      if (chunk.type !== "chunk") continue;
      const loaded = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`);
      Object.assign(entries, loaded.default);
    }
    expect(Object.keys(entries).sort()).toEqual(["i:quoted", "i:user"]);
    expect(symbols(sprite)).toHaveLength(1);
  });
});

describe("declaration output", () => {
  it("writes names to a custom path and leaves declarations alone when disabled", async () => {
    project.file("main.tsx", `export const value = 1;`);
    await bundle({ sources: [memorySource()], dts: "types/icons.d.ts" });
    expect(readFileSync(join(project.root, "types/icons.d.ts"), "utf8")).toContain('"i:home"');
    await bundle({ sources: [memorySource()], dts: false });
    expect(existsSync(join(project.root, "znaki.d.ts"))).toBe(false);
  });
});
