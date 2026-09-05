import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { useProject } from "../fixtures/project.ts";
import { memorySource } from "../fixtures/sources.ts";
import { buildProject } from "../helpers/build.ts";
import type { ZnakiOptions } from "../helpers/build.ts";

const project = useProject("znaki-build");

const EMPTY_SPRITE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"></svg>`;

const bundle = (options: ZnakiOptions, entry?: string) => buildProject({ root: project.root, options, entry });

describe("virtual:znaki/sprite", () => {
  it("emits a sprite asset with a symbol per used icon", async () => {
    project.file(
      "main.tsx",
      `import { spriteUrl } from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;\nexport { spriteUrl };`,
    );

    const { sprite } = await bundle({ sources: [memorySource()], dts: false });

    expect(sprite).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><symbol id="znaki-i-home" viewBox="0 0 16 16" fill="none"><path d="M1 1"/></symbol></svg>`,
    );
  });

  it("exposes the emitted sprite url and the static name set", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;`);

    const { chunk } = await bundle({ sources: [memorySource()], dts: false });

    expect(chunk).toContain('new Set(["i:home"])');
    expect(chunk).toMatch(/znaki-sprite[-\w]*\.svg/);
  });

  it("only includes icons that are actually used", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:user" />;`);

    const { sprite } = await bundle({ sources: [memorySource()], dts: false });

    expect(sprite).toContain("znaki-i-user");
    expect(sprite).not.toContain("znaki-i-home");
  });

  it("escapes attribute values in the sprite markup", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:quoted" />;`);

    const { sprite } = await bundle({ sources: [memorySource()], dts: false });
    expect(sprite).toContain(`title="a &quot;b&quot; &amp; &lt;c>"`);
  });

  it("emits an empty sprite when nothing is used", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";`);

    expect((await bundle({ sources: [memorySource()], dts: false })).sprite).toBe(EMPTY_SPRITE);
  });

  it("leaves the source code untransformed", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    expect((await bundle({ sources: [memorySource()], dts: false })).chunk).not.toContain("M1 1");
  });

  it("collects icons from a custom component name", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <MyIcon name="i:home" />;`);

    const { sprite } = await bundle({ sources: [memorySource()], component: "MyIcon", dts: false });
    expect(sprite).toContain("znaki-i-home");
  });

  it("ignores the default component name when a custom one is configured", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;`);

    const { sprite } = await bundle({ sources: [memorySource()], component: "MyIcon", dts: false });
    expect(sprite).toBe(EMPTY_SPRITE);
  });
});

describe("virtual:znaki/registry", () => {
  it("is empty when every usage is static", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/registry";\nexport const C = () => <Icon name="i:home" />;`);

    const { chunk } = await bundle({ sources: [memorySource()], dts: false });
    expect(chunk).toMatch(/registry\s*=\s*\{\s*\}/);
  });

  it("lists every source icon when a dynamic usage exists", async () => {
    project.file("main.tsx", `export * from "virtual:znaki/registry";\nexport const C = (p) => <Icon name={p.name} />;`);

    const { chunk } = await bundle({ sources: [memorySource()], dts: false });

    expect(chunk).toContain('"i:home"');
    expect(chunk).toContain('"i:user"');
  });
});

describe("virtual:znaki/icon/*", () => {
  it("serves icon data for a direct import", async () => {
    project.file("main.tsx", `export { default } from "virtual:znaki/icon/i%3Ahome";`);

    const { chunk } = await bundle({ sources: [memorySource()], dts: false });
    expect(chunk).toContain(`"viewBox": "0 0 16 16"`);
  });
});

describe("dts generation", () => {
  it("writes znaki.d.ts by default with every available name", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    await bundle({ sources: [memorySource()] });

    const content = readFileSync(join(project.root, "znaki.d.ts"), "utf-8");
    expect(content).toContain('"i:home"');
    expect(content).toContain('"i:user"');
  });

  it("honours a custom dts path relative to the root", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    await bundle({ sources: [memorySource()], dts: "types/icons.d.ts" });

    expect(readFileSync(join(project.root, "types", "icons.d.ts"), "utf-8")).toContain('"i:home"');
  });

  it("writes nothing when dts is false", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    await bundle({ sources: [memorySource()], dts: false });

    expect(readdirSync(project.root)).not.toContain("znaki.d.ts");
  });
});
