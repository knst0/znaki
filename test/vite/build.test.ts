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
    const { sprite, lazy } = await bundle({ sources: [memorySource()], dts: false });
    expect(symbols(sprite)).toHaveLength(0);
    expect(symbols(lazy)).toHaveLength(0);
  });
});

describe("lazy delivery", () => {
  it("emits lazy icons in a separate sprite file the browser fetches through use href", async () => {
    project.file(
      "main.tsx",
      `import { Icon } from "znaki";
      export const A = () => <Icon name="i:home"/>;
      export const B = (props) => <Icon name={props.name}/>;
      export * from "virtual:znaki/sprite";`,
    );
    const { sprite, lazy, chunk, assets } = await bundle({
      sources: [memorySource()],
      includeIcons: ["i:home"],
      lazyIcons: ["i:*"],
      dts: false,
    });
    // Static delivery wins: home stays in the main sprite, out of the lazy file.
    expect(symbols(sprite)).toHaveLength(1);
    expect(sprite).toContain('id="znaki-i_3a_home"');
    expect(sprite).not.toContain("znaki-i_3a_user");
    const lazyIds = [...symbols(lazy)].map((node) => node.getAttribute("id"));
    expect(lazyIds).toEqual(expect.arrayContaining(["znaki-i_3a_quoted", "znaki-i_3a_user"]));
    expect(lazyIds).toHaveLength(2);
    // Emitted URLs point at the real hashed files so hashed bases resolve.
    const spriteFile = assets.find((asset) => asset.fileName.includes("sprite"))?.fileName ?? "";
    const lazyFile = assets.find((asset) => asset.fileName.includes("lazy"))?.fileName ?? "";
    expect(spriteFile).not.toBe("");
    expect(lazyFile).not.toBe("");
    expect(chunk).toContain(spriteFile);
    expect(chunk).toContain(lazyFile);
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
