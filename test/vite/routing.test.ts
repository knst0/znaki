import { symlinkSync } from "node:fs";
import { resolve } from "node:path";

import { fileRoutes } from "filesystem-routing/vite";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import znaki from "../../src/vite/index.ts";
import { useProject } from "../fixtures/project.ts";
import { memorySource } from "../fixtures/sources.ts";
import { build, createServer } from "../helpers/vite.ts";
import type { Rollup, UserConfig } from "../helpers/vite.ts";

const project = useProject("znaki-routing");

function setup(): UserConfig {
  symlinkSync(resolve(import.meta.dirname, "../../node_modules"), resolve(project.root, "node_modules"), "dir");
  project.file(
    "src/routes/index.tsx",
    `import React from "react";
import { Icon } from "znaki";
export default function Page() { return <Icon name="i:home"/>; }
export const route = { icon: () => <Icon name="i:user"/> };`,
  );
  project.file(
    "main.tsx",
    `export { default as routes } from "virtual:file-routes";
export * from "virtual:znaki/sprite";`,
  );
  return {
    root: project.root,
    logLevel: "silent",
    resolve: {
      alias: {
        "znaki/runtime": resolve(import.meta.dirname, "../../src/runtime/index.ts"),
        znaki: resolve(import.meta.dirname, "../../src/index.ts"),
      },
    },
    oxc: { jsx: { runtime: "classic" } },
    // The scan must not conceal icons lost by a query transform or by merging
    // the default and route selections under the same pathname.
    plugins: [fileRoutes(), znaki({ sources: [memorySource()], include: [], dts: false })],
  };
}

function symbolIds(markup: string): string[] {
  const window = new Window();
  const document = new window.DOMParser().parseFromString(markup, "image/svg+xml");
  return [...document.querySelectorAll("symbol")].map((symbol) => symbol.id).sort();
}

describe("filesystem-routing query modules", () => {
  it("builds both route selections and retains both discoveries", async () => {
    const result = await build({
      ...setup(),
      build: {
        write: false,
        minify: false,
        lib: { entry: "main.tsx", formats: ["es"] },
        rollupOptions: { external: ["react"] },
      },
    });
    const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
    const sprite = outputs.flatMap((output) => output.output).find((item) => item.type === "asset" && item.fileName.includes("sprite"));
    expect(sprite?.type === "asset" ? symbolIds(String(sprite.source)) : []).toEqual(["znaki-i_3a_home", "znaki-i_3a_user"]);
  });

  it("renders route queries in development and leaves raw and URL requests as assets", async () => {
    const server = await createServer({ ...setup(), server: { middlewareMode: true, watch: null } });
    try {
      const { default: routes } = await server.ssrLoadModule("virtual:file-routes");
      const page = await routes[0].$component.import();
      expect(renderToStaticMarkup(page.default())).toContain("#znaki-i_3a_home");
      expect(renderToStaticMarkup(routes[0].$$route.require().route.icon())).toContain("#znaki-i_3a_user");
      const manifest = await server.ssrLoadModule("virtual:znaki/sprite");
      expect(manifest.staticNames).toEqual(new Set(["i:home", "i:user"]));

      const withoutLang = await server.ssrLoadModule("/src/routes/index.tsx?pick=default&pick=$css");
      expect(renderToStaticMarkup(withoutLang.default())).toContain("#znaki-i_3a_home");

      const raw = await server.ssrLoadModule("/src/routes/index.tsx?raw&lang.tsx");
      expect(raw.default).toContain('<Icon name="i:home"/>');
      const url = await server.ssrLoadModule("/src/routes/index.tsx?url&lang.tsx");
      expect(new URL(url.default, "http://localhost").pathname).toBe("/src/routes/index.tsx");
    } finally {
      await server.close();
    }
  });
});
