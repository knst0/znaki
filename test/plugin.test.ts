import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { Rollup } from "vite";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { IconData, IconMode } from "../src/types.ts";
import znaki from "../src/vite/index.ts";
import type { IconSource } from "../src/vite/source.ts";

const ICONS: Record<string, IconData> = {
  home: { body: `<path d="M1 1"/>`, viewBox: "0 0 16 16", attrs: { fill: "none" } },
  user: { body: "<circle/>", viewBox: "0 0 24 24", attrs: {} },
  quoted: { body: "<g/>", viewBox: "0 0 2 2", attrs: { title: `a "b" & <c>` } },
};

function memory(mode?: IconMode, prefix = "i"): IconSource {
  return {
    prefix,
    mode,
    dirs: [],
    list: () => Object.keys(ICONS),
    load: (name) => ICONS[name] ?? null,
  };
}

let root: string;
const warnings: string[] = [];

function file(relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

type RollupOutput = Rollup.RollupOutput;
type Output = RollupOutput["output"];

async function bundle(options: Parameters<typeof znaki>[0], entry = "main.tsx"): Promise<Output> {
  const result = (await build({
    root,
    logLevel: "silent",
    customLogger: {
      info: () => {},
      warn: (message: string) => warnings.push(message),
      warnOnce: (message: string) => warnings.push(message),
      error: (message: string) => warnings.push(message),
      clearScreen: () => {},
      hasErrorLogged: () => false,
      hasWarned: false,
    },
    plugins: [znaki(options)],
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ["es"], fileName: "out" },
    },
  })) as RollupOutput | RollupOutput[];
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.flatMap((item) => [...item.output]) as Output;
}

function chunk(output: Output): string {
  return output
    .filter((item) => item.type === "chunk")
    .map((item) => item.code)
    .join("\n");
}

function sprite(output: Output): string {
  const asset = output.find((item) => item.type === "asset" && String(item.fileName).endsWith(".svg"));
  return asset && asset.type === "asset" ? String(asset.source) : "";
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "znaki-plugin-"));
  warnings.length = 0;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("virtual:znaki/sprite", () => {
  it("emits a sprite asset with a symbol per used icon", async () => {
    file(
      "main.tsx",
      `import { spriteUrl } from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;\nexport { spriteUrl };`,
    );

    const output = await bundle({ sources: [memory()], dts: false });

    expect(sprite(output)).toBe(
      `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="znaki-i-home" viewBox="0 0 16 16" fill="none"><path d="M1 1"/></symbol></svg>`,
    );
  });

  it("exposes the emitted sprite url and the static name set", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;`);

    const output = await bundle({ sources: [memory()], dts: false });
    const code = chunk(output);

    expect(code).toContain('new Set(["i:home"])');
    expect(code).toMatch(/znaki-sprite[-\w]*\.svg/);
  });

  it("only includes icons that are actually used", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:user" />;`);

    const markup = sprite(await bundle({ sources: [memory()], dts: false }));

    expect(markup).toContain("znaki-i-user");
    expect(markup).not.toContain("znaki-i-home");
  });

  it("escapes attribute values in the sprite markup", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:quoted" />;`);

    expect(sprite(await bundle({ sources: [memory()], dts: false }))).toContain(`title="a &quot;b&quot; &amp; &lt;c>"`);
  });

  it("emits an empty sprite when nothing is used", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";`);

    expect(sprite(await bundle({ sources: [memory()], dts: false }))).toBe(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
  });

  it("excludes inline-mode icons from the sprite", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;`);

    expect(sprite(await bundle({ sources: [memory("inline")], dts: false }))).toBe(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
  });

  it("uses the plugin mode option as the default", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;`);

    const markup = sprite(await bundle({ sources: [memory()], mode: "inline", dts: false }));
    expect(markup).toBe(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
  });
});

describe("inline transform", () => {
  it("injects a data prop and an icon import for inline icons", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    const code = chunk(await bundle({ sources: [memory("inline")], dts: false }));

    expect(code).toContain(`<path d="M1 1"/>`);
    expect(code).toContain(`"viewBox": "0 0 16 16"`);
    expect(code).toMatch(/data:\s*__znaki_0/);
  });

  it("reuses one binding for repeated icons", async () => {
    file("main.tsx", `export const C = () => <><Icon name="i:home" /><Icon name="i:home" /></>;`);

    const code = chunk(await bundle({ sources: [memory("inline")], dts: false }));

    expect(code.match(/M1 1/g)).toHaveLength(1);
  });

  it("leaves sprite icons untransformed", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    expect(chunk(await bundle({ sources: [memory()], dts: false }))).not.toContain("M1 1");
  });

  it("respects a custom component name", async () => {
    file("main.tsx", `export const C = () => <MyIcon name="i:home" />;`);

    const code = chunk(await bundle({ sources: [memory("inline")], component: "MyIcon", dts: false }));
    expect(code).toContain("M1 1");
  });

  it("ignores the default component name when a custom one is configured", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";\nexport const C = () => <Icon name="i:home" />;`);

    const output = await bundle({ sources: [memory()], component: "MyIcon", dts: false });
    expect(sprite(output)).toBe(`<svg xmlns="http://www.w3.org/2000/svg"></svg>`);
  });
});

describe("virtual:znaki/registry", () => {
  it("is empty when every usage is static", async () => {
    file("main.tsx", `export * from "virtual:znaki/registry";\nexport const C = () => <Icon name="i:home" />;`);

    const code = chunk(await bundle({ sources: [memory()], dts: false }));
    expect(code).toMatch(/registry\s*=\s*\{\s*\}/);
  });

  it("lists every source icon when a dynamic usage exists", async () => {
    file("main.tsx", `export * from "virtual:znaki/registry";\nexport const C = (p) => <Icon name={p.name} />;`);

    const code = chunk(await bundle({ sources: [memory()], dts: false }));

    expect(code).toContain('"i:home"');
    expect(code).toContain('"i:user"');
  });

  it("warns about dynamic usage", async () => {
    file("main.tsx", `export const C = (p) => <Icon name={p.name} />;`);

    await bundle({ sources: [memory()], dts: false });

    expect(warnings.join("\n")).toContain("dynamic <Icon name={...}>");
  });

  it("warns about icons missing from every source", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:nope" />;`);

    await bundle({ sources: [memory()], dts: false });

    expect(warnings.join("\n")).toContain(`icon "i:nope" not found`);
  });
});

describe("virtual:znaki/icon/*", () => {
  it("serves icon data for a direct import", async () => {
    file("main.tsx", `export { default } from "virtual:znaki/icon/i%3Ahome";`);

    expect(chunk(await bundle({ sources: [memory()], dts: false }))).toContain(`"viewBox": "0 0 16 16"`);
  });
});

describe("dts generation", () => {
  it("writes znaki.d.ts by default with every available name", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    await bundle({ sources: [memory()] });

    const content = readFileSync(join(root, "znaki.d.ts"), "utf-8");
    expect(content).toContain('"i:home"');
    expect(content).toContain('"i:user"');
  });

  it("honours a custom dts path relative to the root", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    await bundle({ sources: [memory()], dts: "types/icons.d.ts" });

    expect(readFileSync(join(root, "types", "icons.d.ts"), "utf-8")).toContain('"i:home"');
  });

  it("writes nothing when dts is false", async () => {
    file("main.tsx", `export const C = () => <Icon name="i:home" />;`);

    await bundle({ sources: [memory()], dts: false });

    expect(readdirSync(root)).not.toContain("znaki.d.ts");
  });
});

describe("project scanning", () => {
  it("collects icons from files that are never imported", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";`);
    file("unused.tsx", `export const C = () => <Icon name="i:user" />;`);

    expect(sprite(await bundle({ sources: [memory()], dts: false }))).toContain("znaki-i-user");
  });

  it("limits scanning to the include directories", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";`);
    file(join("src", "a.tsx"), `export const A = () => <Icon name="i:home" />;`);
    file(join("other", "b.tsx"), `export const B = () => <Icon name="i:user" />;`);

    const markup = sprite(await bundle({ sources: [memory()], include: ["src"], dts: false }));

    expect(markup).toContain("znaki-i-home");
    expect(markup).not.toContain("znaki-i-user");
  });

  it("ignores a missing include directory", async () => {
    file("main.tsx", `export * from "virtual:znaki/sprite";`);

    await expect(bundle({ sources: [memory()], include: ["nope"], dts: false })).resolves.toBeDefined();
  });
});
