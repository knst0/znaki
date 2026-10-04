import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ICONS } from "../fixtures/icons.ts";
import { useProject } from "../fixtures/project.ts";
import { fakeSource, memorySource } from "../fixtures/sources.ts";
import { buildProject } from "../helpers/build.ts";

const project = useProject("znaki-options");

describe("project scanning", () => {
  it("collects declared usage from included directories but not output or excluded directories", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    project.file(join("src", "a.tsx"), `import { Icon } from "znaki"; export const A = () => <Icon name="i:home"/>;`);
    project.file(join("vendor", "b.tsx"), `import { Icon } from "znaki"; export const B = () => <Icon name="i:user"/>;`);
    project.file(join("dist", "old.tsx"), `import { Icon } from "znaki"; export const B = () => <Icon name="i:user"/>;`);
    const { sprite } = await buildProject({ root: project.root, options: { sources: [memorySource()], exclude: ["vendor"], dts: false } });
    expect(sprite).toContain('id="znaki-i_3a_home"');
    expect(sprite).not.toContain('id="znaki-i_3a_user"');
  });

  it("limits initial discovery to explicitly included directories", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    project.file(join("src", "a.tsx"), `import { Icon } from "znaki"; export const A = () => <Icon name="i:home"/>;`);
    project.file(join("other", "b.tsx"), `import { Icon } from "znaki"; export const B = () => <Icon name="i:user"/>;`);
    const { sprite } = await buildProject({ root: project.root, options: { sources: [memorySource()], include: ["src"], dts: false } });
    expect(sprite).toContain('id="znaki-i_3a_home"');
    expect(sprite).not.toContain('id="znaki-i_3a_user"');
  });

  it("rejects an unresolved static name in a production build", async () => {
    project.file("main.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="i:nope"/>;`);
    await expect(buildProject({ root: project.root, options: { sources: [memorySource()], dts: false } })).rejects.toThrow(/i:nope/);
  });
});

describe("source precedence", () => {
  it("rejects ambiguous names unless first-source overrides are explicitly allowed", async () => {
    project.file("main.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="i:home"/>;`);
    const options = { sources: [memorySource(), fakeSource("i", { home: ICONS.user })], dts: false as const };
    await expect(buildProject({ root: project.root, options })).rejects.toThrow(/collision.*i:home/);
    const { sprite } = await buildProject({ root: project.root, options: { ...options, allowOverrides: true } });
    expect(sprite).toContain('d="M1 1"');
    expect(sprite).not.toContain("<circle");
  });
});
