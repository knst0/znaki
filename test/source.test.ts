import { describe, expect, it, vi } from "vitest";

import type { IconData, IconMode } from "../src/types.ts";
import type { IconSource } from "../src/vite/source.ts";
import { SourceRegistry } from "../src/vite/source.ts";

const data = (viewBox: string): IconData => ({ body: "<path/>", viewBox, attrs: {} });

function fake(prefix: string, icons: Record<string, IconData>, mode?: IconMode, dirs: string[] = []): IconSource {
  return {
    prefix,
    mode,
    dirs,
    list: () => Object.keys(icons),
    load: (name) => icons[name] ?? null,
  };
}

describe("SourceRegistry.resolve", () => {
  it("resolves a prefixed name from its source", () => {
    const registry = new SourceRegistry([fake("tabler", { home: data("0 0 1 1") })], "sprite");
    expect(registry.resolve("tabler:home")).toEqual({ data: data("0 0 1 1"), mode: "sprite" });
  });

  it("returns null for an unknown name", () => {
    const registry = new SourceRegistry([fake("tabler", {})], "sprite");
    expect(registry.resolve("tabler:nope")).toBeNull();
  });

  it("does not match a name with the wrong prefix", () => {
    const registry = new SourceRegistry([fake("tabler", { home: data("0 0 1 1") })], "sprite");
    expect(registry.resolve("local:home")).toBeNull();
    expect(registry.resolve("home")).toBeNull();
  });

  it("matches unprefixed names only against an unprefixed source", () => {
    const registry = new SourceRegistry([fake("", { home: data("0 0 1 1") })], "sprite");
    expect(registry.resolve("home")?.data).toEqual(data("0 0 1 1"));
    expect(registry.resolve("x:home")).toBeNull();
  });

  it("takes the first source that has the icon", () => {
    const registry = new SourceRegistry([fake("i", { home: data("0 0 1 1") }), fake("i", { home: data("0 0 9 9") })], "sprite");
    expect(registry.resolve("i:home")?.data.viewBox).toBe("0 0 1 1");
  });

  it("falls through to a later source when the first misses", () => {
    const registry = new SourceRegistry([fake("i", {}), fake("i", { home: data("0 0 9 9") })], "sprite");
    expect(registry.resolve("i:home")?.data.viewBox).toBe("0 0 9 9");
  });

  it("prefers the source mode over the default mode", () => {
    const registry = new SourceRegistry([fake("i", { a: data("0 0 1 1") }, "inline")], "sprite");
    expect(registry.resolve("i:a")?.mode).toBe("inline");
  });

  it("uses the default mode when the source has none", () => {
    const registry = new SourceRegistry([fake("i", { a: data("0 0 1 1") })], "inline");
    expect(registry.resolve("i:a")?.mode).toBe("inline");
  });
});

describe("SourceRegistry caching", () => {
  it("caches hits and misses", () => {
    const load = vi.fn(() => null);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], list: () => [], load }], "sprite");

    registry.resolve("i:a");
    registry.resolve("i:a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("re-resolves after invalidate", () => {
    const load = vi.fn(() => null);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], list: () => [], load }], "sprite");

    registry.resolve("i:a");
    registry.invalidate();
    registry.resolve("i:a");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caches the name list until invalidated", () => {
    const list = vi.fn(() => ["a"]);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], list, load: () => null }], "sprite");

    registry.names();
    registry.names();
    expect(list).toHaveBeenCalledTimes(1);

    registry.invalidate();
    registry.names();
    expect(list).toHaveBeenCalledTimes(2);
  });
});

describe("SourceRegistry.names", () => {
  it("prefixes, dedupes and sorts names", () => {
    const registry = new SourceRegistry(
      [fake("b", { z: data("0 0 1 1"), a: data("0 0 1 1") }), fake("a", { m: data("0 0 1 1") })],
      "sprite",
    );
    expect(registry.names()).toEqual(["a:m", "b:a", "b:z"]);
  });

  it("leaves names from an unprefixed source bare", () => {
    const registry = new SourceRegistry([fake("", { home: data("0 0 1 1") })], "sprite");
    expect(registry.names()).toEqual(["home"]);
  });
});

describe("SourceRegistry init and watchDirs", () => {
  it("collects watch dirs from every source", () => {
    const registry = new SourceRegistry([fake("a", {}, undefined, ["/x"]), fake("b", {}, undefined, ["/y", "/z"])], "sprite");
    expect(registry.watchDirs).toEqual(["/x", "/y", "/z"]);
  });

  it("initialises every source with the root and clears caches", () => {
    const init = vi.fn();
    const list = vi.fn(() => ["a"]);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], init, list, load: () => null }], "sprite");

    registry.names();
    registry.init("/root");

    expect(init).toHaveBeenCalledWith("/root");
    registry.names();
    expect(list).toHaveBeenCalledTimes(2);
  });
});
