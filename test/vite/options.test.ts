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

describe("dynamic delivery warning", () => {
  const dynamicPage = `import { Icon } from "znaki";
export const C = (props: { name: string }) => (
  <Icon name={props.name}/>
);`;

  it("warns once with a source location when a dynamic name has no explicit delivery", async () => {
    project.file("page.tsx", dynamicPage);
    project.file(
      "main.tsx",
      `export { C } from "./page.tsx?pick=C&lang.tsx";
export { C as Other } from "./page.tsx?pick=C&mode=alternate";`,
    );
    const { warnings, sprite, lazy } = await buildProject({ root: project.root, options: { sources: [memorySource()], dts: false } });
    // The initial scan and distinct query transforms share one source warning.
    const dynamicWarnings = warnings.filter((warning) => warning.includes("dynamic icon name"));
    expect(dynamicWarnings).toHaveLength(1);
    expect(dynamicWarnings[0]).toContain("page.tsx:3:15");
    expect(dynamicWarnings[0]).toContain("includeIcons");
    expect(dynamicWarnings[0]).toContain("lazyIcons");
    expect(sprite).not.toContain("<symbol");
    expect(lazy).not.toContain("<symbol");
  });

  it.each([
    ["includeIcons", { includeIcons: ["i:home"] }],
    ["lazyIcons", { lazyIcons: ["i:home"] }],
  ])("stays silent when %s configures delivery", async (_label, delivery) => {
    project.file("main.tsx", dynamicPage);
    const { warnings } = await buildProject({ root: project.root, options: { sources: [memorySource()], dts: false, ...delivery } });
    expect(warnings.filter((warning) => warning.includes("dynamic icon name"))).toEqual([]);
  });

  it.each([
    ["literal", `import { Icon } from "znaki"; export const C = () => <Icon name="i:home"/>;`],
    [
      "finite conditional",
      `import { Icon } from "znaki"; export const C = (props: { active: boolean }) => <Icon name={props.active ? "i:home" : "i:user"}/>;`,
    ],
  ])("stays silent for a static %s without explicit delivery", async (_label, code) => {
    project.file("main.tsx", code);
    const { warnings } = await buildProject({ root: project.root, options: { sources: [memorySource()], dts: false } });
    expect(warnings.filter((warning) => warning.includes("dynamic icon name"))).toEqual([]);
  });
});
