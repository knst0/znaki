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
  it("combines custom static and dynamic usage with JSX without including unrelated icons", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite"; export * from "virtual:znaki/registry";`);
    project.file("view.tsx", `<Icon name="i:quoted" />;`);
    project.file("view.icons", JSON.stringify({ names: ["i:home"], dynamic: true, literals: ["i:user"], prefixes: ["i:arrow-"] }));
    const source = fakeSource("i", { ...ICONS, "arrow-left": ICONS.home, unused: ICONS.user });
    const { sprite, output } = await buildProject({ root: project.root, options: { sources: [source], framework, dts: false } });

    expect(sprite).toContain('id="znaki-i-quoted"');
    expect(sprite).not.toContain("znaki-i-unused");
    expect(sprite).toContain('id="znaki-i-user"');
    expect(sprite).toContain('id="znaki-i-home"');
    expect(sprite).not.toContain("znaki-i-arrow-");
    const chunks = output.flatMap((item) => (item.type === "chunk" && item.isDynamicEntry ? [item.code] : [])).join("\n");
    expect(chunks).toContain('"i:arrow-left"');
    expect(chunks).not.toContain('"i:home"');
  });

  it("replaces custom file usage on hot updates, including empty results", async () => {
    project.file("view.icons", JSON.stringify({ names: ["i:home"], dynamic: false }));
    const h = createHotHarness({ root: project.root, sources: [memorySource()], options: { framework } });
    h.configResolved();
    await h.buildStart();

    await h.hotUpdate(join(project.root, "view.icons"), JSON.stringify({ names: [], dynamic: true, prefixes: ["i:user"] }));
    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
    expect(h.invalidated).toContain("\0virtual:znaki/registry");
    expect(h.load("\0virtual:znaki/sprite")).not.toContain('"i:home"');
    expect(h.load("\0virtual:znaki/shard/i-us")).toContain('"i:user"');

    await h.hotUpdate(join(project.root, "view.icons"), JSON.stringify({ names: [], dynamic: false }));
    expect(h.load("\0virtual:znaki/shard/i-us")).not.toContain('"i:user"');
  });

  it("surfaces custom parser errors instead of silently omitting icons", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    project.file("view.icons", "invalid JSON");
    await expect(buildProject({ root: project.root, options: { sources: [memorySource()], framework, dts: false } })).rejects.toThrow();
  });
});
