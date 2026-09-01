import { describe, expect, it } from "vitest";

import { symbolId } from "../src/id.ts";

describe("symbolId", () => {
  it("prefixes plain names", () => {
    expect(symbolId("home")).toBe("znaki-home");
  });

  it("keeps safe characters", () => {
    expect(symbolId("arrow-right_2")).toBe("znaki-arrow-right_2");
  });

  it("replaces unsafe characters", () => {
    expect(symbolId("tabler:arrow/right")).toBe("znaki-tabler-arrow-right");
    expect(symbolId("a b.c")).toBe("znaki-a-b-c");
    expect(symbolId("ёлка")).toBe("znaki-----");
  });

  it("handles empty names", () => {
    expect(symbolId("")).toBe("znaki-");
  });
});
