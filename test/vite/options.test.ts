import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { useProject } from "../fixtures/project.ts";
import { memorySource } from "../fixtures/sources.ts";
import { buildProject } from "../helpers/build.ts";
import type { ZnakiOptions } from "../helpers/build.ts";

const project = useProject("znaki-options");

const bundle = (options: ZnakiOptions) => buildProject({ root: project.root, options });

describe("warnings", () => {
  it("warns about dynamic usage", async () => {
    project.file("main.tsx", `export const C = (p) => <Icon name={p.name} />;`);

    const { warnings } = await bundle({ sources: [memorySource()], dts: false });

    expect(warnings.join("\n")).toContain("dynamic <Icon name={...}>");
  });

  it("warns about icons missing from every source", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:nope" />;`);

    const { warnings } = await bundle({ sources: [memorySource()], dts: false });

    expect(warnings.join("\n")).toContain(`icon "i:nope" not found`);
  });
});

describe("project scanning", () => {
  it("collects icons from files that are never imported", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    project.file("unused.tsx", `export const C = () => <Icon name="i:user" />;`);

    const { sprite } = await bundle({ sources: [memorySource()], dts: false });
    expect(sprite).toContain("znaki-i-user");
  });

  it("limits scanning to the include directories", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    project.file(join("src", "a.tsx"), `export const A = () => <Icon name="i:home" />;`);
    project.file(join("other", "b.tsx"), `export const B = () => <Icon name="i:user" />;`);

    const { sprite } = await bundle({ sources: [memorySource()], include: ["src"], dts: false });

    expect(sprite).toContain("znaki-i-home");
    expect(sprite).not.toContain("znaki-i-user");
  });

  it("skips build output and excluded directories", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);
    project.file(join("dist", "old.tsx"), `export const A = () => <Icon name="i:home" />;`);
    project.file(join("vendor", "b.tsx"), `export const B = () => <Icon name="i:user" />;`);

    const { sprite } = await bundle({ sources: [memorySource()], exclude: ["vendor"], dts: false });

    expect(sprite).not.toContain("znaki-i-home");
    expect(sprite).not.toContain("znaki-i-user");
  });

  it("ignores a missing include directory", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);

    await expect(bundle({ sources: [memorySource()], include: ["nope"], dts: false })).resolves.toBeDefined();
  });
});
