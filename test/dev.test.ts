import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { ViteDevServer } from "vite";
import { createServer } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { IconData } from "../src/types.ts";
import znaki from "../src/vite/index.ts";
import type { ZnakiOptions } from "../src/vite/index.ts";
import type { IconSource } from "../src/vite/source.ts";

const ICONS: Record<string, IconData> = {
  home: { body: "<path/>", viewBox: "0 0 16 16", attrs: {} },
  user: { body: "<circle/>", viewBox: "0 0 24 24", attrs: {} },
};

const source: IconSource = {
  prefix: "i",
  dirs: [],
  list: () => Object.keys(ICONS),
  load: (name) => ICONS[name] ?? null,
};

let root: string;
let server: ViteDevServer;

function file(relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

async function start(options: Partial<ZnakiOptions> = {}): Promise<ViteDevServer> {
  server = await createServer({
    root,
    logLevel: "silent",
    oxc: { jsx: "preserve" },
    server: { middlewareMode: true, watch: null },
    plugins: [znaki({ sources: [source], dts: false, ...options })],
  });
  return server;
}

async function request(path: string): Promise<Response> {
  const http = createHttpServer(server.middlewares);
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  const { port } = http.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`);
  } finally {
    await new Promise((done) => http.close(done));
  }
}

async function spriteModule(): Promise<string> {
  const result = await server.environments.client.transformRequest("virtual:znaki/sprite");
  return result?.code ?? "";
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "znaki-dev-"));
});

afterEach(async () => {
  await server?.close();
  rmSync(root, { recursive: true, force: true });
});

describe("dev sprite module", () => {
  it("points at the dev sprite endpoint with a version query", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start();

    expect(await spriteModule()).toContain("/@znaki/sprite.svg?v=0");
  });

  it("respects the configured base", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    server = await createServer({
      root,
      base: "/app/",
      logLevel: "silent",
      oxc: { jsx: "preserve" },
      server: { middlewareMode: true, watch: null },
      plugins: [znaki({ sources: [source], dts: false })],
    });

    expect(await spriteModule()).toContain("/app/@znaki/sprite.svg");
  });

  it("exposes the statically discovered names", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start();

    expect(await spriteModule()).toContain('new Set(["i:home"])');
  });
});

describe("dev sprite endpoint", () => {
  it("includes a symbol for each used icon", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start();

    const response = await request("/@znaki/sprite.svg");

    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("no-cache");

    const markup = await response.text();
    expect(markup).toContain(`<symbol id="znaki-i-home" viewBox="0 0 16 16"><path/></symbol>`);
    expect(markup).not.toContain("znaki-i-user");
  });
});

describe("dev transform discovery", () => {
  it("picks up icons found while scanning the project at startup", async () => {
    file("main.tsx", `export const C = () => <div />;`);
    file("late.tsx", `export const D = () => <Icon name="i:user" />;`);
    await start();

    const code = await spriteModule();
    expect(code).toContain("?v=0");
    expect(code).toContain('new Set(["i:user"])');
  });

  it("bumps the version and re-serves the sprite when a new file adds an icon", async () => {
    file("main.tsx", `export const C = () => <div />;`);
    await start();

    expect(await spriteModule()).toContain("new Set([])");

    file("late.tsx", `export const D = () => <Icon name="i:user" />;`);
    await server.environments.client.transformRequest("/late.tsx");

    const updated = await spriteModule();
    expect(updated).toContain("?v=1");
    expect(updated).toContain('"i:user"');
    expect(await (await request("/@znaki/sprite.svg")).text()).toContain("znaki-i-user");
  });

  it("does not bump the version when nothing changes", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start();

    await spriteModule();
    await server.environments.client.transformRequest("/main.tsx");

    expect(await spriteModule()).toContain("?v=0");
  });
});

describe("dev registry", () => {
  it("stays empty while every usage is static", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);
    await start();

    const result = await server.environments.client.transformRequest("virtual:znaki/registry");
    expect(result?.code).toMatch(/registry\s*=\s*\{\s*\}/);
  });

  it("fills in once a dynamic usage appears", async () => {
    file("main.tsx", `export const C = (p) => <Icon name={p.name} />;`);
    await start();

    const result = await server.environments.client.transformRequest("virtual:znaki/registry");
    expect(result?.code).toContain('"i:home"');
    expect(result?.code).toContain('"i:user"');
  });
});
