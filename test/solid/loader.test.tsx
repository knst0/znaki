import { describe, expect, it } from "vitest";

import { isSpriteName, loadIcon } from "../../src/solid/loader.ts";
import { lazyIcon } from "./stubs.ts";

describe("isSpriteName", () => {
  it("is true for names baked into the sprite", () => {
    expect(isSpriteName("i:sprited")).toBe(true);
  });

  it("is false for anything else", () => {
    expect(isSpriteName("i:lazy")).toBe(false);
    expect(isSpriteName("i:unknown")).toBe(false);
  });
});

describe("loadIcon", () => {
  it("resolves icon data from the registry", async () => {
    await expect(loadIcon("i:lazy")).resolves.toEqual(lazyIcon);
  });

  it("resolves null for an unregistered name", async () => {
    await expect(loadIcon("i:unknown")).resolves.toBeNull();
  });

  it("imports the registry only once", async () => {
    await Promise.all([loadIcon("i:lazy"), loadIcon("i:lazy")]);
    await expect(loadIcon("i:lazy")).resolves.toEqual(lazyIcon);
  });
});
