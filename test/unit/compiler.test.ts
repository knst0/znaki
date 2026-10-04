import { describe, expect, it } from "vitest";

import { compileIcons } from "../../src/vite/compiler.ts";

const options = { target: "react", lazy: false } as const;

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
    const result = compileIcons(code, "view.tsx", options);
    expect([...(result?.names ?? [])].sort()).toEqual(names);
    expect(result?.dynamic).toBe(dynamic);
  });

  it("ignores unrelated JSX components", () => {
    expect(
      compileIcons('import { Icon } from "another-library"; const C = () => <Icon name="unrelated"/>;', "view.tsx", options),
    ).toBeNull();
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
    expect(() => compileIcons(code, "view.tsx", options)).toThrow(/znaki: view\.tsx:/);
  });
});
