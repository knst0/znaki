import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { local } from "../../src/vite/sources/local.ts";
import { SVG } from "../fixtures/icons.ts";
import { useProject } from "../fixtures/project.ts";
import { createHotHarness } from "../helpers/hot.ts";
import type { HotHarness, HotParams } from "../helpers/hot.ts";

const project = useProject("znaki-hot");
let iconDir: string;
beforeEach(() => {
  iconDir = join(project.root, "icons");
  mkdirSync(iconDir, { recursive: true });
  writeFileSync(join(iconDir, "home.svg"), SVG);
});

async function harness(options: HotParams["options"] = {}): Promise<HotHarness> {
  const h = createHotHarness({ root: project.root, sources: [local({ dir: iconDir })], options });
  h.configResolved();
  await h.buildStart();
  return h;
}

async function spriteNames(h: HotHarness): Promise<string[]> {
  const code = h.load("\0virtual:znaki/sprite")!;
  // The virtual module content is selected by the current HMR state.
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  return [...module.staticNames];
}

describe("hot update transitions", () => {
  it("adds and removes usage and keeps an unchanged usage stable", async () => {
    project.file("main.tsx", `export const C = () => <div />;`);
    const h = await harness();
    await h.hotUpdate(join(project.root, "main.tsx"), `import { Icon } from "znaki"; export const C = () => <Icon name="local:home"/>;`);
    expect(await spriteNames(h)).toEqual(["local:home"]);
    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
    h.invalidated.length = 0;
    await h.hotUpdate(
      join(project.root, "main.tsx"),
      `import { Icon } from "znaki"; export const C = () => <Icon name="local:home" className="changed"/>;`,
    );
    expect(h.invalidated).toEqual([]);
    await h.hotUpdate(join(project.root, "main.tsx"), `export const C = () => <div/>;`);
    expect(await spriteNames(h)).toEqual([]);
  });

  it("refreshes types and explicit wildcard inclusion when a source icon is added or removed", async () => {
    const h = await harness({ includeIcons: ["local:*"], dts: "znaki.d.ts" });
    writeFileSync(join(iconDir, "added.svg"), SVG);
    await h.hotUpdate(join(iconDir, "added.svg"), SVG);
    expect(await spriteNames(h)).toEqual(["local:added", "local:home"]);
    expect(readFileSync(join(project.root, "znaki.d.ts"), "utf8")).toContain('"local:added"');
    rmSync(join(iconDir, "added.svg"));
    await h.hotUpdate(join(iconDir, "added.svg"), "");
    expect(await spriteNames(h)).toEqual(["local:home"]);
    expect(readFileSync(join(project.root, "znaki.d.ts"), "utf8")).not.toContain('"local:added"');
  });

  it("invalidates sprite content even when source names are unchanged", async () => {
    project.file("main.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="local:home"/>;`);
    const h = await harness();
    writeFileSync(join(iconDir, "home.svg"), `<svg viewBox="0 0 32 32"><circle r="2"/></svg>`);
    await h.hotUpdate(join(iconDir, "home.svg"), "");
    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
  });

  it("resets deleted usage between builds", async () => {
    project.file("main.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="local:home"/>;`);
    const h = await harness();
    expect(await spriteNames(h)).toEqual(["local:home"]);
    rmSync(join(project.root, "main.tsx"));
    await h.buildStart();
    expect(await spriteNames(h)).toEqual([]);
  });

  it("refreshes the lazy sprite when a matching source icon appears", async () => {
    project.file("main.tsx", `export const n = 1;`);
    const h = await harness({ lazyIcons: ["local:*"] });
    writeFileSync(join(iconDir, "added.svg"), SVG);
    await h.hotUpdate(join(iconDir, "added.svg"), SVG);
    expect(h.load("\0virtual:znaki/sprite")).toContain("local:added");
    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
  });
});
