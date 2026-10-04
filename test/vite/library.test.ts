import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { library } from "../../src/vite/sources/library.ts";
import { useProject } from "../fixtures/project.ts";
import { buildProject } from "../helpers/build.ts";
import { createHotHarness } from "../helpers/hot.ts";

const project = useProject("znaki-library");

describe("custom icon library parser", () => {
  it("normalizes parsed SVG and structured data into sprite, lazy data and generated names", async () => {
    const catalogue = { home: { width: 32, height: 16, radius: 2 }, user: { width: 48, height: 24, radius: 4 } };
    const source = library({
      prefix: "custom",
      list: () => Object.keys(catalogue),
      load: (name) => catalogue[name as keyof typeof catalogue] ?? null,
      parse: (icon, name) =>
        name === "home"
          ? `<svg width="${icon.width}" height="${icon.height}"><circle r="${icon.radius}"/></svg>`
          : { viewBox: `0 0 ${icon.width} ${icon.height}`, attrs: {}, body: `<circle r="${icon.radius}"/>` },
    });
    project.file(
      "main.tsx",
      `import { Icon } from "znaki"; export const C = () => <Icon name="custom:home"/>; export * from "virtual:znaki/registry";`,
    );
    const result = await buildProject({ root: project.root, options: { sources: [source], lazyIcons: ["custom:user"] } });
    expect(result.sprite).toContain('viewBox="0 0 32 16"');
    expect(result.sprite).toContain('r="2"');
    expect(result.sprite).not.toContain('r="4"');
    const declarations = readFileSync(join(project.root, "znaki.d.ts"), "utf8");
    expect(declarations).toContain('"custom:home"');
    expect(declarations).toContain('"custom:user"');
    const shard = result.output.find((item) => item.type === "chunk" && item.isDynamicEntry);
    if (!shard || shard.type !== "chunk") throw new Error("missing custom library shard");
    // Load the emitted shard, whose path and code are selected by the bundler.
    const module = await import(`data:text/javascript;base64,${Buffer.from(shard.code).toString("base64")}`);
    expect(module.default["custom:user"].viewBox).toBe("0 0 48 24");
    expect(module.default["custom:user"].body).toContain('r="4"');
  });

  it("reloads a watched catalogue and regenerates names", async () => {
    let catalogue: Record<string, string> = {};
    project.file("catalogue/icons.json", JSON.stringify({ home: '<svg viewBox="0 0 16 16"><path/></svg>' }));
    const source = library({
      prefix: "custom",
      dirs: ["catalogue"],
      init(root) {
        catalogue = JSON.parse(readFileSync(join(root, "catalogue/icons.json"), "utf8"));
      },
      list: () => Object.keys(catalogue),
      load: (name) => catalogue[name] ?? null,
      parse: (svg) => svg,
    });
    const h = createHotHarness({ root: project.root, sources: [source], options: { includeIcons: ["custom:*"], dts: "znaki.d.ts" } });
    h.configResolved();
    await h.buildStart();
    project.file("catalogue/icons.json", JSON.stringify({ added: '<svg viewBox="0 0 24 24"><circle/></svg>' }));
    await h.hotUpdate(join(project.root, "catalogue/icons.json"), "");
    const declarations = readFileSync(join(project.root, "znaki.d.ts"), "utf8");
    expect(declarations).toContain('"custom:added"');
    expect(declarations).not.toContain('"custom:home"');
    expect(h.invalidated).toContain("\0virtual:znaki/sprite");
  });

  it("reports the full icon name when a custom parser fails", async () => {
    const source = library({
      prefix: "broken",
      list: () => ["logo"],
      load: () => "bad",
      parse() {
        throw new Error("invalid catalogue entry");
      },
    });
    project.file("main.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="broken:logo"/>;`);
    await expect(buildProject({ root: project.root, options: { sources: [source], dts: false } })).rejects.toThrow(
      /broken:logo.*invalid catalogue entry/,
    );
  });
});
