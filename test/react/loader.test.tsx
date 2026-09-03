import { describe, expect, it } from "vitest";

import { isSpriteName, loadIcon } from "../../src/react/loader.ts";
import { lazyIcon } from "../fixtures/virtual.ts";

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

  it("returns a stable promise per name so use() can suspend", () => {
    expect(loadIcon("i:lazy")).toBe(loadIcon("i:lazy"));
  });
});
