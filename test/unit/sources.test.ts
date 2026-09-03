import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { local } from "../../src/vite/sources/local.ts";
import { tabler } from "../../src/vite/sources/tabler.ts";
import { SVG_ATTRS } from "../fixtures/icons.ts";
import { useProject } from "../fixtures/project.ts";

const project = useProject("znaki-src");

const icon = (relative: string, content = SVG_ATTRS) => project.file(relative, content);

describe("local source", () => {
  it("defaults to the local prefix and inherits no mode", () => {
    const source = local({ dir: project.root });
    expect(source.prefix).toBe("local");
    expect(source.mode).toBeUndefined();
  });

  it("honours prefix and mode options", () => {
    const source = local({ dir: project.root, prefix: "app", mode: "inline" });
    expect(source.prefix).toBe("app");
    expect(source.mode).toBe("inline");
  });

  it("lists svg files without their extension", () => {
    icon("home.svg");
    icon("user.svg");
    icon("notes.txt", "x");

    expect(local({ dir: project.root }).list().sort()).toEqual(["home", "user"]);
  });

  it("lists nested icons with posix separators", () => {
    icon(join("nav", "home.svg"));
    expect(local({ dir: project.root }).list()).toEqual(["nav/home"]);
  });

  it("skips dot files and dot directories", () => {
    icon(".hidden.svg");
    icon(join(".git", "a.svg"));
    icon("visible.svg");

    expect(local({ dir: project.root }).list()).toEqual(["visible"]);
  });

  it("lists nothing when the directory is missing", () => {
    expect(local({ dir: join(project.root, "missing") }).list()).toEqual([]);
  });

  it("loads and parses an icon", () => {
    icon("home.svg");
    expect(local({ dir: project.root }).load("home")).toEqual({
      body: `<path d="M1 1"/>`,
      viewBox: "0 0 16 16",
      attrs: { fill: "none" },
    });
  });

  it("loads a nested icon by posix name", () => {
    icon(join("nav", "home.svg"));
    expect(local({ dir: project.root }).load("nav/home")).not.toBeNull();
  });

  it("returns null for a missing icon", () => {
    expect(local({ dir: project.root }).load("nope")).toBeNull();
  });

  it("returns null for an unparsable file", () => {
    icon("bad.svg", "not svg");
    expect(local({ dir: project.root }).load("bad")).toBeNull();
  });

  it("refuses traversal outside the directory", () => {
    icon(join("..", "outside.svg"));
    expect(local({ dir: project.root }).load("../outside")).toBeNull();
  });

  it("reports the resolved directory for watching", () => {
    expect(local({ dir: project.root }).dirs).toEqual([resolve(project.root)]);
  });

  it("re-resolves a relative dir against the vite root on init", () => {
    icon(join("icons", "home.svg"));
    const source = local({ dir: "icons" });

    source.init?.(project.root);

    expect(source.dirs).toEqual([resolve(project.root, "icons")]);
    expect(source.list()).toEqual(["home"]);
    expect(source.load("home")).not.toBeNull();
  });
});

describe("tabler source", () => {
  it("defaults to the tabler prefix and no watch dirs", () => {
    const source = tabler();
    expect(source.prefix).toBe("tabler");
    expect(source.dirs).toEqual([]);
    expect(source.mode).toBeUndefined();
  });

  it("honours prefix and mode options", () => {
    const source = tabler({ prefix: "tb", mode: "inline" });
    expect(source.prefix).toBe("tb");
    expect(source.mode).toBe("inline");
  });

  it("lists outline icons by default", () => {
    const list = tabler().list();
    expect(list).toContain("arrow-right");
    expect(list.every((name) => !name.endsWith(".svg"))).toBe(true);
  });

  it("lists filled icons for the filled variant", () => {
    expect(tabler({ variant: "filled" }).list()).toContain("circle");
  });

  it("loads a real icon", () => {
    const data = tabler().load("arrow-right");
    expect(data?.body).toContain("<path");
    expect(data?.viewBox).toBe("0 0 24 24");
  });

  it("returns null for a missing icon", () => {
    expect(tabler().load("definitely-not-an-icon")).toBeNull();
  });

  it("refuses traversal outside the icon directory", () => {
    expect(tabler().load("../../package")).toBeNull();
  });
});
