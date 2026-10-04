import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { symbolId } from "../../src/id.ts";
import { prefixIds } from "../../src/svg-ids.ts";
import type { IconData } from "../../src/types.ts";
import { normalizeIcon, parseSvg, spriteMarkup, symbolMarkup } from "../../src/vite/svg.ts";

const symbols = (markup: string) => {
  const window = new Window();
  return new window.DOMParser().parseFromString(markup, "image/svg+xml");
};

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

  it("keeps the explicit viewBox instead of falling back to width and height", () => {
    expect(parseSvg(`<svg width="24" height="24" viewBox="0 0 32 32"><path/></svg>`)?.viewBox).toBe("0 0 32 32");
  });

  it("derives the viewBox from numeric width and height", () => {
    expect(parseSvg(`<svg width="32" height="16"><path/></svg>`)?.viewBox).toBe("0 0 32 16");
    expect(parseSvg(`<svg width="32px" height="16px"><path/></svg>`)?.viewBox).toBe("0 0 32 16");
  });

  it.each([
    ["missing geometry", `<svg><path/></svg>`],
    ["percentage dimensions", `<svg width="100%" height="100%"><path/></svg>`],
    ["a single dimension", `<svg width="24"><path/></svg>`],
    ["short viewBox", `<svg viewBox="0 0 24"><path/></svg>`],
    ["non-numeric viewBox", `<svg viewBox="a b c d"><path/></svg>`],
    ["zero-size viewBox", `<svg viewBox="0 0 0 0"><path/></svg>`],
    ["uppercase VIEWBOX", `<svg VIEWBOX="0 0 12 12"><path/></svg>`],
  ])("throws for %s instead of defaulting geometry", (_label, source) => {
    expect(() => parseSvg(source)).toThrow(/^znaki: /);
  });

  it("drops identity, namespace and version attributes but keeps presentation ones", () => {
    const result = parseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="x" class="icon" width="1" height="1" preserveAspectRatio="xMidYMid meet"><g/></svg>`,
    );

    expect(result?.attrs).toEqual({ preserveAspectRatio: "xMidYMid meet" });
  });

  it("accepts single-quoted attributes and passes the body through verbatim", () => {
    expect(parseSvg(`<svg viewBox='0 0 8 8' fill='red'><path d='M0 0'/></svg>`)).toEqual({
      body: `<path d='M0 0'/>`,
      viewBox: "0 0 8 8",
      attrs: { fill: "red" },
    });
  });

  it("ignores prolog and comments outside the svg element", () => {
    const result = parseSvg(`<?xml version="1.0"?><!-- c --><svg viewBox="0 0 1 1"><path/></svg><!-- trailing -->`);
    expect(result?.body).toBe("<path/>");
  });

  it.each([
    ["empty input", ""],
    ["non-svg markup", "<div></div>"],
    ["plain text", "not svg"],
    ["comments only", "<!-- nothing here -->"],
  ])("returns null for %s", (_label, source) => {
    expect(parseSvg(source)).toBeNull();
  });

  it.each([
    ["unclosed root", `<svg viewBox="0 0 1 1"><path/>`],
    ["mismatched tags", `<svg viewBox="0 0 1 1"><g></path></svg>`],
  ])("throws for %s", (_label, source) => {
    expect(() => parseSvg(source)).toThrow(/^znaki: invalid SVG/);
  });

  it("rejects doctype and entity declarations", () => {
    expect(() => parseSvg(`<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 1 1"><path/></svg>`)).toThrow(/DOCTYPE/);
  });

  it.each([
    ["script element", `<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>`, /<script>/],
    ["foreignObject", `<svg viewBox="0 0 1 1"><foreignObject><div/></foreignObject></svg>`, /<foreignObject>/],
    ["event handler", `<svg viewBox="0 0 1 1"><path onload="x"/></svg>`, /onload/],
    ["root event handler", `<svg viewBox="0 0 1 1" onload="x"><path/></svg>`, /onload/],
    ["javascript href", `<svg viewBox="0 0 1 1"><a href="javascript:alert(1)"><path/></a></svg>`, /href/],
    ["style element", `<svg viewBox="0 0 1 1"><style>.a{fill:red}</style></svg>`, /<style>/],
    ["editor attribute", `<svg viewBox="0 0 1 1"><path inkscape:label="x"/></svg>`, /namespace/],
    ["root editor attribute", `<svg viewBox="0 0 1 1" inkscape:version="1.0"><path/></svg>`, /namespace/],
    ["prefixed element", `<svg viewBox="0 0 1 1"><inkscape:group><path/></inkscape:group></svg>`, /namespace/],
  ])("rejects %s", (_label, source, pattern) => {
    expect(() => parseSvg(source)).toThrow(/^znaki: /);
    expect(() => parseSvg(source)).toThrow(pattern);
  });

  it("keeps xml: and xlink: uses while deriving nothing from them", () => {
    const result = parseSvg(
      `<svg viewBox="0 0 10 10" xml:space="preserve"><text xml:lang="en">hi</text><use xlink:href="#t"/><path id="t"/></svg>`,
    );

    expect(result?.attrs).toEqual({ "xml:space": "preserve" });
    expect(result?.body).toContain('xlink:href="#t"');
  });

  it("throws for overflowing numeric dimensions instead of emitting Infinity", () => {
    const huge = `1${"0".repeat(400)}`;
    expect(() => parseSvg(`<svg width="${huge}" height="16"><path/></svg>`)).toThrow(/^znaki: /);
  });

  it("rejects paint references on the svg root", () => {
    const source = `<svg viewBox="0 0 1 1" fill="url(#g)"><defs><linearGradient id="g"/></defs></svg>`;
    expect(() => parseSvg(source)).toThrow(/paint references/);
  });
});

describe("sprite markup", () => {
  const entries: [string, IconData][] = [
    ["i:home", { body: `<path d="M1 1"/>`, viewBox: "0 0 16 16", attrs: { fill: "none" } }],
    ["i:user", { body: "<circle/>", viewBox: "0 0 24 24", attrs: {} }],
  ];

  it("exposes every icon as a namespaced symbol that hrefs can target", () => {
    const doc = symbols(spriteMarkup(entries));

    for (const [name, data] of entries) {
      const symbol = doc.querySelector(`symbol[id="${symbolId(name)}"]`);
      expect(symbol?.getAttribute("viewBox")).toBe(data.viewBox);
      expect(symbol?.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    }
    expect(doc.querySelectorAll("symbol")).toHaveLength(entries.length);
  });

  it("keeps gradient, clipPath and href references consistent within each symbol", () => {
    const doc = symbols(
      spriteMarkup([
        [
          "i:painted",
          {
            body: `<defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><circle r="1"/></clipPath></defs><rect fill="url(#g)" clip-path="url(#c)"/><use href="#t"/><path id="t" d="M0 0"/>`,
            viewBox: "0 0 24 24",
            attrs: {},
          },
        ],
      ]),
    );
    const symbol = doc.querySelector("symbol");
    const gradId = symbol?.querySelector("linearGradient")?.getAttribute("id") ?? "";
    const clipId = symbol?.querySelector("clipPath")?.getAttribute("id") ?? "";
    const targetId = symbol?.querySelector("path")?.getAttribute("id") ?? "";

    expect(symbol?.querySelector("rect")?.getAttribute("fill")).toBe(`url(#${gradId})`);
    expect(symbol?.querySelector("rect")?.getAttribute("clip-path")).toBe(`url(#${clipId})`);
    expect(symbol?.querySelector("use")?.getAttribute("href")).toBe(`#${targetId}`);
    expect(new Set([gradId, clipId, targetId]).size).toBe(3);
  });

  it("namespaces repeated inner ids per symbol so copies never cross-talk", () => {
    const body = `<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect fill="url(#g)"/>`;
    const doc = symbols(
      spriteMarkup([
        ["i:first", { body, viewBox: "0 0 24 24", attrs: {} }],
        ["i:second", { body, viewBox: "0 0 24 24", attrs: {} }],
      ]),
    );
    const [first, second] = [...doc.querySelectorAll("symbol")];
    const firstId = first.querySelector("linearGradient")?.getAttribute("id") ?? "";
    const secondId = second.querySelector("linearGradient")?.getAttribute("id") ?? "";

    expect(firstId).not.toBe(secondId);
    expect(first.querySelector("rect")?.getAttribute("fill")).toBe(`url(#${firstId})`);
    expect(second.querySelector("rect")?.getAttribute("fill")).toBe(`url(#${secondId})`);
  });

  it("rewrites single-quoted ids and xlink:href references", () => {
    const doc = symbols(
      spriteMarkup([
        [
          "i:quoted-ids",
          {
            body: `<defs><linearGradient id='q'><stop offset='0'/></linearGradient></defs><rect fill='url(#q)'/><use xlink:href='#t'/><path id='t'/>`,
            viewBox: "0 0 24 24",
            attrs: {},
          },
        ],
      ]),
    );
    const symbol = doc.querySelector("symbol");
    const gradId = symbol?.querySelector("linearGradient")?.getAttribute("id") ?? "";
    const targetId = symbol?.querySelector("path")?.getAttribute("id") ?? "";

    expect(gradId).not.toBe("q");
    expect(symbol?.querySelector("rect")?.getAttribute("fill")).toBe(`url(#${gradId})`);
    expect(symbol?.querySelector("use")?.getAttribute("xlink:href")).toBe(`#${targetId}`);
  });

  it("leaves external references untouched", () => {
    const doc = symbols(
      spriteMarkup([
        [
          "i:external",
          {
            body: `<use href="other.svg#x"/><rect fill="url(#g)"/><defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>`,
            viewBox: "0 0 24 24",
            attrs: {},
          },
        ],
      ]),
    );
    const symbol = doc.querySelector("symbol");
    const gradId = symbol?.querySelector("linearGradient")?.getAttribute("id") ?? "";

    expect(symbol?.querySelector("use")?.getAttribute("href")).toBe("other.svg#x");
    expect(symbol?.querySelector("rect")?.getAttribute("fill")).toBe(`url(#${gradId})`);
  });

  it("escapes attribute values without changing their decoded value", () => {
    const doc = symbols(symbolMarkup("i:quoted", { body: "<g/>", viewBox: "0 0 2 2", attrs: { title: `a "b" & <c>` } }));
    expect(doc.querySelector("symbol")?.getAttribute("title")).toBe(`a "b" & <c>`);
  });

  it("emits namespace declarations with zero symbols for empty input", () => {
    const doc = symbols(spriteMarkup([]));
    expect(doc.querySelectorAll("symbol")).toHaveLength(0);
    expect(doc.documentElement?.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(doc.documentElement?.getAttribute("xmlns:xlink")).toBe("http://www.w3.org/1999/xlink");
  });
});

describe("prefixIds", () => {
  it("rewrites aria id references alongside url and href", () => {
    const out = prefixIds(
      `<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><title id="t">x</title><g aria-labelledby="t"><rect fill="url(#g)"/></g>`,
      "p",
    );
    expect(out).toContain('id="p-t"');
    expect(out).toContain('aria-labelledby="p-t"');
    expect(out).toContain("url(#p-g)");
  });

  it("isolates repeated bodies under different prefixes", () => {
    const body = `<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><rect fill="url(#g)"/>`;
    const a = prefixIds(body, "a");
    const b = prefixIds(body, "b");

    expect(a).toContain('id="a-g"');
    expect(a).toContain("url(#a-g)");
    expect(b).toContain('id="b-g"');
    expect(a).not.toContain("b-g");
    expect(b).not.toContain("a-g");
  });

  it("leaves empty ids alone", () => {
    expect(prefixIds('<path id="" d="M0 0"/>', "p")).toContain('id=""');
  });

  it("rejects style elements", () => {
    expect(() => prefixIds(`<style>.a{fill:red}</style>`, "p")).toThrow(/<style>/);
  });

  it("leaves text, comments and attribute prose untouched", () => {
    const out = prefixIds(
      `<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs><!-- id="g" url(#g) --><text>see id="g"</text><path data-note='use id="g" here' fill="url(#g)"/>`,
      "p",
    );

    expect(out).toContain('<!-- id="g" url(#g) -->');
    expect(out).toContain('<text>see id="g"</text>');
    expect(out).toContain('data-note="use id=&quot;g&quot; here"');
    expect(out).toContain('id="p-g"');
    expect(out).toContain("url(#p-g)");
  });

  it("matches ids and references across equivalent entity encodings", () => {
    const out = prefixIds(`<defs><linearGradient id="a&#38;b"><stop offset="0"/></linearGradient></defs><rect fill="url(#a&amp;b)"/>`, "p");

    expect(out).toContain('id="p-a&amp;b"');
    expect(out).toContain("url(#p-a&amp;b)");
  });

  it("rejects SMIL syncbase references instead of silently breaking them", () => {
    expect(() => prefixIds(`<circle id="c" r="1"><animate attributeName="r" begin="c.click" dur="1s"/></circle>`, "p")).toThrow(/SMIL/);
  });

  it("allows plain clock timing values", () => {
    expect(prefixIds(`<animate attributeName="r" begin="0s" dur="1s"/>`, "p")).toContain('begin="0s"');
  });

  it("ignores style-like text inside comments", () => {
    expect(prefixIds("<!-- <style> -->", "p")).toBe("<!-- <style> -->");
  });
});

describe("normalizeIcon", () => {
  it("passes hand-built icon data through file-level validation", () => {
    expect(normalizeIcon({ body: "<path/>", viewBox: "0 0 16 16", attrs: { fill: "none", width: "9" } })).toEqual({
      body: "<path/>",
      viewBox: "0 0 16 16",
      attrs: { fill: "none" },
    });
  });

  it("rejects hand-built data with unusable geometry or unsafe content", () => {
    expect(() => normalizeIcon({ body: "<path/>", viewBox: "0 0 0", attrs: {} })).toThrow(/^znaki: /);
    expect(() => normalizeIcon({ body: `<script>x</script>`, viewBox: "0 0 1 1", attrs: {} })).toThrow(/<script>/);
  });
});
