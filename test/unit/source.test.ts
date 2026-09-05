import { describe, expect, it, vi } from "vitest";

import { SourceRegistry } from "../../src/vite/source.ts";
import { iconData } from "../fixtures/icons.ts";
import { fakeSource } from "../fixtures/sources.ts";

const data = iconData;

describe("SourceRegistry.resolve", () => {
  it("resolves a prefixed name from its source", () => {
    const registry = new SourceRegistry([fakeSource("tabler", { home: data("0 0 1 1") })]);
    expect(registry.resolve("tabler:home")).toEqual(data("0 0 1 1"));
  });

  it("returns null for an unknown name", () => {
    const registry = new SourceRegistry([fakeSource("tabler", {})]);
    expect(registry.resolve("tabler:nope")).toBeNull();
  });

  it("does not match a name with the wrong prefix", () => {
    const registry = new SourceRegistry([fakeSource("tabler", { home: data("0 0 1 1") })]);
    expect(registry.resolve("local:home")).toBeNull();
    expect(registry.resolve("home")).toBeNull();
  });

  it("matches unprefixed names only against an unprefixed source", () => {
    const registry = new SourceRegistry([fakeSource("", { home: data("0 0 1 1") })]);
    expect(registry.resolve("home")).toEqual(data("0 0 1 1"));
    expect(registry.resolve("x:home")).toBeNull();
  });

  it("takes the first source that has the icon", () => {
    const registry = new SourceRegistry([fakeSource("i", { home: data("0 0 1 1") }), fakeSource("i", { home: data("0 0 9 9") })]);
    expect(registry.resolve("i:home")?.viewBox).toBe("0 0 1 1");
  });

  it("falls through to a later source when the first misses", () => {
    const registry = new SourceRegistry([fakeSource("i", {}), fakeSource("i", { home: data("0 0 9 9") })]);
    expect(registry.resolve("i:home")?.viewBox).toBe("0 0 9 9");
  });
});

describe("SourceRegistry caching", () => {
  it("caches hits and misses", () => {
    const load = vi.fn(() => null);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], list: () => [], load }]);

    registry.resolve("i:a");
    registry.resolve("i:a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("re-resolves after invalidate", () => {
    const load = vi.fn(() => null);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], list: () => [], load }]);

    registry.resolve("i:a");
    registry.invalidate();
    registry.resolve("i:a");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("caches the name list until invalidated", () => {
    const list = vi.fn(() => ["a"]);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], list, load: () => null }]);

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
    const registry = new SourceRegistry([
      fakeSource("b", { z: data("0 0 1 1"), a: data("0 0 1 1") }),
      fakeSource("a", { m: data("0 0 1 1") }),
    ]);
    expect(registry.names()).toEqual(["a:m", "b:a", "b:z"]);
  });

  it("leaves names from an unprefixed source bare", () => {
    const registry = new SourceRegistry([fakeSource("", { home: data("0 0 1 1") })]);
    expect(registry.names()).toEqual(["home"]);
  });
});

describe("SourceRegistry init and watchDirs", () => {
  it("collects watch dirs from every source", () => {
    const registry = new SourceRegistry([fakeSource("a", {}, ["/x"]), fakeSource("b", {}, ["/y", "/z"])]);
    expect(registry.watchDirs).toEqual(["/x", "/y", "/z"]);
  });

  it("initialises every source with the root and clears caches", () => {
    const init = vi.fn();
    const list = vi.fn(() => ["a"]);
    const registry = new SourceRegistry([{ prefix: "i", dirs: [], init, list, load: () => null }]);

    registry.names();
    registry.init("/root");

    expect(init).toHaveBeenCalledWith("/root");
    registry.names();
    expect(list).toHaveBeenCalledTimes(2);
  });
});
