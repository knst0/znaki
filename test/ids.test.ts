import { describe, expect, it } from "vitest";

import {
  ICON_PREFIX,
  ICON_PREFIX_RESOLVED,
  iconId,
  iconName,
  REGISTRY_ID,
  REGISTRY_RESOLVED,
  SPRITE_ID,
  SPRITE_RESOLVED,
} from "../src/vite/ids.ts";

describe("virtual ids", () => {
  it("exposes the public specifiers", () => {
    expect(SPRITE_ID).toBe("virtual:znaki/sprite");
    expect(REGISTRY_ID).toBe("virtual:znaki/registry");
    expect(ICON_PREFIX).toBe("virtual:znaki/icon/");
  });

  it("prefixes resolved ids with a null byte", () => {
    expect(SPRITE_RESOLVED).toBe("\0virtual:znaki/sprite");
    expect(REGISTRY_RESOLVED).toBe("\0virtual:znaki/registry");
    expect(ICON_PREFIX_RESOLVED).toBe("\0virtual:znaki/icon/");
  });

  it("encodes icon names into ids", () => {
    expect(iconId("home")).toBe("virtual:znaki/icon/home");
    expect(iconId("tabler:arrow-right")).toBe("virtual:znaki/icon/tabler%3Aarrow-right");
    expect(iconId("nested/icon name")).toBe("virtual:znaki/icon/nested%2Ficon%20name");
  });

  it("round-trips through the resolved id", () => {
    for (const name of ["home", "tabler:arrow-right", "nested/icon name", "a+b&c"]) {
      expect(iconName(`\0${iconId(name)}`)).toBe(name);
    }
  });
});
