import { describe, expect, it } from "vitest";

import { compileIcons } from "../../src/vite/compiler.ts";

const compile = (code: string) => compileIcons(code, "view.tsx");

describe("intrinsic discovery", () => {
  it.each([
    ['import { Icon as Glyph } from "znaki"; const C = () => <Glyph name="a"/>;', ["a"], false],
    ['import * as Z from "znaki"; const C = () => <Z.Icon name="b"/>;', ["b"], false],
    ['import { Icon } from "znaki"; const C = (Icon) => <Icon name="shadowed"/>;', [], false],
    ['import { Icon } from "znaki"; const C = (p) => <Icon name={p.active ? "a" : "b"}/>;', ["a", "b"], false],
    ['import { Icon } from "znaki"; const C = (p) => <Icon name={p.name}/>;', [], true],
    ['import { Icon } from "znaki"; const C = (p) => <Icon {...p}/>;', [], true],
    ['import { Icon } from "znaki"; const values = ["a", "b"]; const C = () => values.map(name => <Icon name={name}/>);', [], true],
    ['import { Icon } from "znaki"; const C = () => <Icon name={`a`}/>;', ["a"], false],
  ])("collects only proven names: %s", (code, names, dynamic) => {
    const result = compile(code);
    expect([...(result?.names ?? [])].sort()).toEqual(names);
    expect(result?.dynamic).toBe(dynamic);
  });

  it("ignores unrelated JSX components", () => {
    expect(compile('import { Icon } from "another-library"; const C = () => <Icon name="unrelated"/>;')).toBeNull();
  });
});

describe("intrinsic diagnostics", () => {
  it.each([
    'import { Icon } from "znaki"; const X = Icon;',
    'import * as Z from "znaki"; const X = Z.Icon;',
    'import * as Z from "znaki"; const X = Z["Icon"];',
    'import * as Z from "znaki"; const { Icon } = Z;',
    'export { Icon as Glyph } from "znaki";',
    'import { Icon } from "znaki"; const C = () => <Icon/>;',
    'import { Icon } from "znaki"; const C = () => <Icon name="a">child</Icon>;',
    'import { PreloadSprite } from "znaki"; const C = () => <PreloadSprite href="x"/>;',
    'import { Icon } from "znaki"; const C = () => <Icon name="a" size/>;',
  ])("rejects unsupported intrinsic usage: %s", (code) => {
    expect(() => compile(code)).toThrow(/znaki: view\.tsx:/);
  });
});

describe("output architecture", () => {
  it("lowers a static icon to an explicit svg+use with no framework component", () => {
    const result = compile('import { Icon } from "znaki"; const C = () => <Icon name="i:home"/>;');
    expect(result?.code).toContain("<svg");
    expect(result?.code).toContain("<use");
    expect(result?.code).toContain("spriteHref");
    expect(result?.code).not.toContain("svgProps");
    expect(result?.code).not.toContain("LazyIcon");
    expect(result?.code).not.toContain("SpriteIcon");
    expect(result?.code).not.toContain("virtual:znaki/component");
  });

  it("routes dynamic and spread icons through one svgProps binding with a use callback", () => {
    const result = compile('import { Icon } from "znaki"; const C = (p) => <Icon name={p.name} size={p.size} {...p} className="x"/>;');
    expect(result?.code).toContain("svgProps");
    expect(result?.code).toContain("spriteHref");
    expect(result?.code).toContain("<svg");
    expect(result?.code).toContain("<use");
    expect(result?.code).not.toContain("LazyIcon");
    expect(result?.code).not.toContain("SpriteIcon");
    expect(result?.code).not.toContain("virtual:znaki/component");
    for (const slice of ["p.name", "p.size", "...p"]) {
      expect(result?.code.split(slice).length).toBe(2);
    }
  });

  it("keeps a single evaluation for a dynamic name without spreads", () => {
    const result = compile('import { Icon } from "znaki"; const C = (p) => <Icon name={p.name} size={p.size}/>;');
    const occurrences = (source: string, slice: string): number => source.split(slice).length - 1;
    expect(occurrences(result?.code ?? "", "p.name")).toBe(1);
    expect(occurrences(result?.code ?? "", "p.size")).toBe(1);
  });

  it("lowers PreloadSprite to a preload link for the main sprite", () => {
    const result = compile('import { PreloadSprite } from "znaki"; const C = () => <PreloadSprite/>;');
    expect(result?.code).toContain('<link rel="preload"');
    expect(result?.code).toContain("spriteUrl");
    expect(result?.code).not.toContain("svgProps");
  });
});
