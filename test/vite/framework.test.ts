import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { FrameworkIntegration, FrameworkScanResult } from "../../src/vite/index.ts";
import { ICONS } from "../fixtures/icons.ts";
import { useProject } from "../fixtures/project.ts";
import { fakeSource, memorySource } from "../fixtures/sources.ts";
import { buildProject } from "../helpers/build.ts";
import { createHotHarness } from "../helpers/hot.ts";

const project = useProject("znaki-framework");
const framework: FrameworkIntegration = {
  include: (id) => id.endsWith(".icons"),
  scan: (code): FrameworkScanResult => JSON.parse(code),
};

describe("custom framework integration", () => {
  it("combines custom usage with JSX and explicitly allowed lazy data", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite"; export * from "virtual:znaki/registry";`);
    project.file("view.tsx", `import { Icon } from "znaki"; <Icon name="i:quoted" />;`);
    project.file("view.icons", JSON.stringify({ names: ["i:home"], dynamic: true }));
    const source = fakeSource("i", { ...ICONS, "arrow-left": ICONS.home, unused: ICONS.user });
    const { sprite, output } = await buildProject({
      root: project.root,
      options: { sources: [source], framework, lazyIcons: ["i:arrow-*"], dts: false },
    });
    expect(sprite).toContain('id="znaki-i_3a_quoted"');
    expect(sprite).toContain('id="znaki-i_3a_home"');
    expect(sprite).not.toContain('id="znaki-i_3a_unused"');
    const entries: string[] = [];
    for (const item of output) {
      if (item.type !== "chunk" || !item.isDynamicEntry) continue;
      // Execute runtime-selected build artifacts rather than asserting generated JS text.
      const module = await import(`data:text/javascript;base64,${Buffer.from(item.code).toString("base64")}`);
      entries.push(...Object.keys(module.default));
    }
    expect(entries).toEqual(["i:arrow-left"]);
  });

  it("replaces custom usage on hot updates, including an empty result", async () => {
    project.file("view.icons", JSON.stringify({ names: ["i:home"], dynamic: false }));
    const h = createHotHarness({ root: project.root, sources: [memorySource()], options: { framework } });
    h.configResolved();
    await h.buildStart();
    await h.hotUpdate(join(project.root, "view.icons"), JSON.stringify({ names: ["i:user"], dynamic: false }));
    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
    expect(h.load("\0virtual:znaki/sprite")).not.toContain('"i:home"');
    expect(h.load("\0virtual:znaki/sprite")).toContain('"i:user"');
    await h.hotUpdate(join(project.root, "view.icons"), JSON.stringify({ names: [], dynamic: false }));
    expect(h.load("\0virtual:znaki/sprite")).not.toContain('"i:user"');
  });

  it("surfaces custom parser errors instead of silently omitting icons", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    project.file("view.icons", "invalid JSON");
    await expect(buildProject({ root: project.root, options: { sources: [memorySource()], framework, dts: false } })).rejects.toThrow();
  });
});
