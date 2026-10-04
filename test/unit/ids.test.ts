import { describe, expect, it } from "vitest";

import { symbolId } from "../../src/id.ts";

describe("symbolId", () => {
  it.each([
    ["home", "znaki-home"],
    ["i:home", "znaki-i_3a_home"],
    ["arrow-right_2", "znaki-arrow_2d_right_5f_2"],
    ["tabler:arrow/right", "znaki-tabler_3a_arrow_2f_right"],
    ["a b.c", "znaki-a_20_b_2e_c"],
    ["", "znaki-"],
  ])("maps %j to %j", (name, expected) => {
    expect(symbolId(name)).toBe(expected);
  });

  it("keeps collision-prone names distinct", () => {
    // Old dash-folding mapped each pair to the same id; sprite <use> hrefs
    // would then resolve to the wrong icon.
    expect(symbolId("local:brand/x")).toBe("znaki-local_3a_brand_2f_x");
    expect(symbolId("local:brand-x")).toBe("znaki-local_3a_brand_2d_x");
    expect(symbolId("local:brand/x")).not.toBe(symbolId("local:brand-x"));
    expect(symbolId("a-b")).not.toBe(symbolId("a/b"));
    expect(symbolId("a_b")).not.toBe(symbolId("a b"));
  });

  it("emits ASCII-only ids for non-ASCII names", () => {
    expect(symbolId("ёлка")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(symbolId("ёлка")).not.toBe(symbolId("елка"));
    expect(symbolId("icon🎉")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
