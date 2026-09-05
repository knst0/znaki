import { describe, expect, it } from "vitest";

import { scanIcons } from "../../src/vite/scan.ts";

function names(code: string, component = "Icon"): string[] {
  return [...scanIcons(code, component).names].sort();
}

describe("scanIcons: literal names", () => {
  it("finds a string literal name", () => {
    expect(names(`const a = () => <Icon name="home" />;`)).toEqual(["home"]);
  });

  it("finds a name in an expression container", () => {
    expect(names(`const a = () => <Icon name={"home"} />;`)).toEqual(["home"]);
  });

  it("finds a name in an untagged template literal", () => {
    expect(names("const a = () => <Icon name={`home`} />;")).toEqual(["home"]);
  });

  it("collects multiple distinct names", () => {
    expect(names(`const a = () => <><Icon name="a" /><Icon name="b" /><Icon name="a" /></>;`)).toEqual(["a", "b"]);
  });

  it("ignores other components", () => {
    expect(names(`const a = () => <Button name="home" />;`)).toEqual([]);
  });

  it("honours a custom component name", () => {
    expect(names(`const a = () => <><MyIcon name="a" /><Icon name="b" /></>;`, "MyIcon")).toEqual(["a"]);
  });

  it("ignores the component without a name attribute", () => {
    const result = scanIcons(`const a = () => <Icon />;`, "Icon");
    expect([...result.names]).toEqual([]);
    expect(result.dynamic).toBe(false);
  });

  it("returns nothing on a parse error", () => {
    const result = scanIcons("const = = =;", "Icon");
    expect([...result.names]).toEqual([]);
    expect(result.dynamic).toBe(false);
  });
});

describe("scanIcons: constant resolution", () => {
  it("resolves a module-level string const", () => {
    expect(names(`const NAME = "home";\nconst a = () => <Icon name={NAME} />;`)).toEqual(["home"]);
  });

  it("resolves a const array of names", () => {
    expect(names(`const NAMES = ["a", "b"];\nconst x = () => <Icon name={NAMES} />;`)).toEqual(["a", "b"]);
  });

  it("resolves an object member", () => {
    expect(names(`const M = { go: "home" };\nconst a = () => <Icon name={M.go} />;`)).toEqual(["home"]);
  });

  it("resolves a computed string member", () => {
    expect(names(`const M = { go: "home" };\nconst a = () => <Icon name={M["go"]} />;`)).toEqual(["home"]);
  });

  it("resolves nested object members", () => {
    expect(names(`const M = { nav: { go: "home" } };\nconst a = () => <Icon name={M.nav.go} />;`)).toEqual(["home"]);
  });

  it("collects icon members across an array of objects", () => {
    expect(names(`const ITEMS = [{ icon: "a" }, { icon: "b" }];\nconst x = () => <Icon name={ITEMS.icon} />;`)).toEqual(["a", "b"]);
  });

  it("sees through as and satisfies", () => {
    expect(names(`const N = "home" as const;\nconst a = () => <Icon name={N satisfies string} />;`)).toEqual(["home"]);
  });

  it("resolves consts declared through other consts", () => {
    expect(names(`const A = "home";\nconst B = A;\nconst x = () => <Icon name={B} />;`)).toEqual(["home"]);
  });

  it("marks unknown identifiers as dynamic", () => {
    const result = scanIcons(`const a = (p) => <Icon name={p.name} />;`, "Icon");
    expect([...result.names]).toEqual([]);
    expect(result.dynamic).toBe(true);
  });

  it("marks let bindings as dynamic", () => {
    expect(scanIcons(`let N = "home";\nconst a = () => <Icon name={N} />;`, "Icon").dynamic).toBe(true);
  });

  it("marks a template literal with expressions as dynamic", () => {
    expect(scanIcons("const a = (p) => <Icon name={`i-${p.x}`} />;", "Icon").dynamic).toBe(true);
  });

  it("ignores arrays containing non-strings", () => {
    expect(scanIcons(`const N = ["a", 1];\nconst x = () => <Icon name={N} />;`, "Icon").dynamic).toBe(true);
  });
});

describe("scanIcons: branching", () => {
  it("collects both branches of a conditional", () => {
    expect(names(`const a = (p) => <Icon name={p.on ? "yes" : "no"} />;`)).toEqual(["no", "yes"]);
  });

  it("is dynamic when one conditional branch is unknown", () => {
    expect(scanIcons(`const a = (p) => <Icon name={p.on ? "yes" : p.other} />;`, "Icon").dynamic).toBe(true);
  });

  it("collects both sides of a logical expression", () => {
    expect(names(`const a = (p) => <Icon name={p.x ? "a" : "b" || "c"} />;`)).toEqual(["a", "b", "c"]);
  });
});

describe("scanIcons: traversal", () => {
  it("finds icons inside function bodies and returns", () => {
    expect(names(`function C() { return <Icon name="home" />; }`)).toEqual(["home"]);
  });

  it("finds icons in exported declarations", () => {
    expect(names(`export function C() { return <Icon name="a" />; }\nexport default function D() { return <Icon name="b" />; }`)).toEqual([
      "a",
      "b",
    ]);
  });

  it("finds icons inside conditionals and loops", () => {
    expect(names(`function C(p) { if (p.x) { return <Icon name="a" />; } for (const i of p.l) { return <Icon name="b" />; } }`)).toEqual([
      "a",
      "b",
    ]);
  });

  it("finds icons inside call arguments and IIFEs", () => {
    expect(names(`const a = wrap(<Icon name="a" />);\nconst b = (() => <Icon name="b" />)();`)).toEqual(["a", "b"]);
  });

  it("finds icons in JSX attribute values", () => {
    expect(names(`const a = <Panel header={<Icon name="a" />} slot=<Icon name="b" /> />;`)).toEqual(["a", "b"]);
  });

  it("finds icons nested in children and fragments", () => {
    expect(names(`const a = <div><span>{<Icon name="a" />}</span><><Icon name="b" /></></div>;`)).toEqual(["a", "b"]);
  });

  it("finds icons behind await and conditional rendering", () => {
    expect(names(`async function C(p) { return await (p.x && <Icon name="a" />); }`)).toEqual(["a"]);
  });
});

describe("scanIcons: For bindings", () => {
  it("binds an array item identifier", () => {
    const code = `const ITEMS = ["a", "b"];\nconst C = () => <For each={ITEMS}>{(item) => <Icon name={item} />}</For>;`;
    expect(names(code)).toEqual(["a", "b"]);
  });

  it("binds a destructured object property", () => {
    const code = `const ITEMS = [{ icon: "a" }, { icon: "b" }];\nconst C = () => <For each={ITEMS}>{({ icon }) => <Icon name={icon} />}</For>;`;
    expect(names(code)).toEqual(["a", "b"]);
  });

  it("resolves a member access on the loop item", () => {
    const code = `const ITEMS = [{ icon: "a" }, { icon: "b" }];\nconst C = () => <For each={ITEMS}>{(item) => <Icon name={item.icon} />}</For>;`;
    expect(names(code)).toEqual(["a", "b"]);
  });

  it("is dynamic when the each value is unknown", () => {
    const code = `const C = (p) => <For each={p.items}>{(item) => <Icon name={item} />}</For>;`;
    expect(scanIcons(code, "Icon").dynamic).toBe(true);
  });

  it("does not leak the loop binding outside the For", () => {
    const code = `const ITEMS = ["a"];\nconst C = () => <><For each={ITEMS}>{(item) => <Icon name={item} />}</For><Icon name={item} /></>;`;
    const result = scanIcons(code, "Icon");
    expect([...result.names]).toEqual(["a"]);
    expect(result.dynamic).toBe(true);
  });
});
