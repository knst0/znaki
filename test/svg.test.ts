import { describe, expect, it } from "vitest";

import { parseSvg } from "../src/vite/svg.ts";

describe("parseSvg", () => {
  it("extracts body, viewBox and attrs", () => {
    const result = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 32 32" fill="none" stroke-width="2"><path d="M0 0" /></svg>`,
    );

    expect(result).toEqual({
      body: `<path d="M0 0" />`,
      viewBox: "0 0 32 32",
      attrs: { fill: "none", "stroke-width": "2" },
    });
  });

  it("defaults the viewBox when missing", () => {
    expect(parseSvg("<svg><path/></svg>")?.viewBox).toBe("0 0 24 24");
  });

  it("drops presentation and identity attributes", () => {
    const result = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="x" class="icon" width="1" height="1"><g/></svg>`,
    );

    expect(result?.attrs).toEqual({});
  });

  it("matches attribute names case-insensitively", () => {
    const result = parseSvg(`<svg VIEWBOX="0 0 12 12" WIDTH="3" Stroke="red"><g/></svg>`);

    expect(result?.viewBox).toBe("0 0 12 12");
    expect(result?.attrs).toEqual({ Stroke: "red" });
  });

  it("accepts single-quoted attribute values", () => {
    expect(parseSvg(`<svg viewBox='0 0 8 8' fill='red'><g/></svg>`)).toEqual({
      body: "<g/>",
      viewBox: "0 0 8 8",
      attrs: { fill: "red" },
    });
  });

  it("trims surrounding whitespace in the body", () => {
    expect(parseSvg("<svg>\n  <path/>\n</svg>")?.body).toBe("<path/>");
  });

  it("keeps multi-line and nested markup", () => {
    expect(parseSvg("<svg><g><path/></g><circle/></svg>")?.body).toBe("<g><path/></g><circle/>");
  });

  it("ignores content outside the svg element", () => {
    const result = parseSvg(`<?xml version="1.0"?><!-- c --><svg viewBox="0 0 1 1"><path/></svg>`);
    expect(result?.body).toBe("<path/>");
  });

  it("returns null for non-svg input", () => {
    expect(parseSvg("")).toBeNull();
    expect(parseSvg("<div></div>")).toBeNull();
    expect(parseSvg("<svg><path/>")).toBeNull();
  });
});
