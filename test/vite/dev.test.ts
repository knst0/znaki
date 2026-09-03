import { afterEach, describe, expect, it } from "vitest";

import { iconData } from "../fixtures/icons.ts";
import { useProject } from "../fixtures/project.ts";
import { fakeSource } from "../fixtures/sources.ts";
import { createDevHarness } from "../helpers/dev.ts";
import type { DevHarness } from "../helpers/dev.ts";

const project = useProject("znaki-dev");

const source = fakeSource("i", {
  home: iconData("0 0 16 16"),
  user: { body: "<circle/>", viewBox: "0 0 24 24", attrs: {} },
});

let harness: DevHarness | undefined;

async function start(base?: string): Promise<DevHarness> {
  harness = await createDevHarness({ root: project.root, sources: [source], base });
  return harness;
}

const spriteModule = () => harness!.transform("virtual:znaki/sprite");

afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("dev sprite module", () => {
  it("points at the dev sprite endpoint with a version query", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start();

    expect(await spriteModule()).toContain("/@znaki/sprite.svg?v=0");
  });

  it("respects the configured base", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start("/app/");

    expect(await spriteModule()).toContain("/app/@znaki/sprite.svg");
  });

  it("exposes the statically discovered names", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start();

    expect(await spriteModule()).toContain('new Set(["i:home"])');
  });
});

describe("dev sprite endpoint", () => {
  it("includes a symbol for each used icon", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    const dev = await start();

    const response = await dev.request("/@znaki/sprite.svg");

    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("no-cache");

    const markup = await response.text();
    expect(markup).toContain(`<symbol id="znaki-i-home" viewBox="0 0 16 16"><path/></symbol>`);
    expect(markup).not.toContain("znaki-i-user");
  });
});

describe("dev transform discovery", () => {
  it("picks up icons found while scanning the project at startup", async () => {
    project.file("main.tsx", `export const C = () => <div />;`);
    project.file("late.tsx", `export const D = () => <Icon name="i:user" />;`);
    await start();

    const code = await spriteModule();
    expect(code).toContain("?v=0");
    expect(code).toContain('new Set(["i:user"])');
  });

  it("bumps the version and re-serves the sprite when a new file adds an icon", async () => {
    project.file("main.tsx", `export const C = () => <div />;`);
    const dev = await start();

    expect(await spriteModule()).toContain("new Set([])");

    project.file("late.tsx", `export const D = () => <Icon name="i:user" />;`);
    await dev.transform("/late.tsx");

    const updated = await spriteModule();
    expect(updated).toContain("?v=1");
    expect(updated).toContain('"i:user"');
    expect(await (await dev.request("/@znaki/sprite.svg")).text()).toContain("znaki-i-user");
  });

  it("does not bump the version when nothing changes", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    const dev = await start();

    await spriteModule();
    await dev.transform("/main.tsx");

    expect(await spriteModule()).toContain("?v=0");
  });
});

describe("dev registry", () => {
  it("stays empty while every usage is static", async () => {
    project.file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    const dev = await start();

    expect(await dev.transform("virtual:znaki/registry")).toMatch(/registry\s*=\s*\{\s*\}/);
  });

  it("fills in once a dynamic usage appears", async () => {
    project.file("main.tsx", `export const C = (p) => <Icon name={p.name} />;`);
    const dev = await start();

    const code = await dev.transform("virtual:znaki/registry");
    expect(code).toContain('"i:home"');
    expect(code).toContain('"i:user"');
  });
});
