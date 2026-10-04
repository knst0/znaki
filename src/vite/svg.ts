import { XMLParser, XMLValidator } from "fast-xml-parser";

import { symbolId } from "../id.ts";
import { prefixIds } from "../svg-ids.ts";
import type { IconData } from "../types.ts";

/**
 * Trusted-source SVG contract.
 *
 * Icon sources are trusted input: files on disk (`local()`) or an installed
 * npm package (`tabler()`). `parseSvg` still rejects active content that has
 * no place in an icon — `<script>` / `<foreignObject>` / `<iframe>` /
 * `<object>` / `<embed>` / `<video>` / `<audio>` elements, `on*` event
 * handler attributes and `javascript:`-style fragment hrefs — and rejects
 * constructs the sprite cannot represent faithfully (`<style>` elements,
 * `<!DOCTYPE>` / `<!ENTITY>` declarations, root-level paint references,
 * namespace-prefixed elements and attributes outside `xml:` / `xlink:`).
 * This is defense in depth for trusted files, not a sanitizer for untrusted
 * SVG: never feed user-uploaded markup through it.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
});

// Static element lookup per repo rule (Record, not Set).
const REJECTED_ELEMENT: Record<string, true> = {
  audio: true,
  embed: true,
  foreignobject: true,
  iframe: true,
  object: true,
  script: true,
  style: true,
  video: true,
};

const VIEWBOX_RE = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[\s,]+[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?){3}\s*$/;
const LENGTH_RE = /^\s*(\d+(?:\.\d+)?|\.\d+)(px)?\s*$/;
// Length-preserving blanking for locating the root element outside comments/PIs/CDATA.
const NON_MARKUP_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>/g;
const UNSAFE_HREF_RE = /^\s*(javascript|vbscript|data:text\/html)/i;
const PAINT_REF_RE = /url\s*\(/i;

/**
 * Normalize trusted SVG source into `IconData`.
 *
 * Returns `null` when the input is not SVG at all (no `<svg` root). Anything
 * that looks like SVG but is malformed, has no usable geometry, or carries
 * rejected content throws a `znaki:`-prefixed diagnostic — callers must
 * surface it instead of silently shipping a broken or 24x24-defaulted icon.
 */
export function parseSvg(source: string): IconData | null {
  if (!source.includes("<svg")) return null;
  if (/<!doctype|<!entity/i.test(source)) {
    throw new Error("znaki: SVG sources must not contain <!DOCTYPE or <!ENTITY declarations");
  }
  const validation = XMLValidator.validate(source);
  if (validation !== true) {
    throw new Error(`znaki: invalid SVG XML (${describeValidationError(validation)})`);
  }
  const parsed: unknown = xml.parse(source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const roots = Object.keys(parsed).filter((key) => !key.startsWith("?"));
  if (roots.length !== 1 || roots[0] !== "svg") return null;
  if (!("svg" in parsed)) return null;
  const node: unknown = parsed.svg;

  const rawAttrs: Record<string, string> = {};
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith("@_")) rawAttrs[key.slice(2)] = String(value);
    }
    assertSafeNode(node);
  }

  const viewBox = resolveViewBox(rawAttrs.viewBox, rawAttrs.width, rawAttrs.height);
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawAttrs)) {
    if (key === "width" || key === "height" || key === "class" || key === "id" || key === "version") continue;
    if (key === "viewBox" || key === "xmlns" || key.startsWith("xmlns:")) continue;
    if (key.includes(":")) {
      const prefix = key.slice(0, key.indexOf(":"));
      if (prefix !== "xml" && prefix !== "xlink") {
        throw new Error(
          `znaki: namespace prefix "${prefix}" on attribute "${key}" is not supported in icon SVG — export plain SVG without editor namespaces`,
        );
      }
    }
    if (key === "href" || key === "xlink:href") {
      throw new Error(`znaki: <svg> root "${key}" references are not supported — move the reference onto an inner element`);
    }
    if (PAINT_REF_RE.test(value)) {
      throw new Error(`znaki: paint references (url(#…)) on the <svg> root are not supported — move the attribute onto an inner element`);
    }
    attrs[key] = value;
  }

  return { body: sliceInnerMarkup(source).trim(), viewBox, attrs };
}

/**
 * Normalize hand-built `IconData` (e.g. from a custom `library<T>` parser
 * result) through the same validation as SVG files, so custom sources cannot
 * bypass geometry checks, unsafe-content rejection, or attribute filtering.
 * Throws a `znaki:`-prefixed diagnostic on invalid input.
 */
export function normalizeIcon(data: IconData): IconData {
  const attrs = Object.entries(data.attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");
  const normalized = parseSvg(`<svg viewBox="${escapeAttr(data.viewBox)}"${attrs}>${data.body}</svg>`);
  if (!normalized) throw new Error("znaki: invalid icon data — not SVG content");
  return normalized;
}

function describeValidationError(validation: unknown): string {
  let line = "?";
  let msg = "malformed XML";
  let code = "UNKNOWN";
  if (validation !== null && typeof validation === "object" && "err" in validation) {
    const err: unknown = validation.err;
    if (err !== null && typeof err === "object") {
      if ("line" in err) line = String(err.line);
      if ("msg" in err) msg = String(err.msg);
      if ("code" in err) code = String(err.code);
    }
  }
  return `line ${line}: ${msg} [${code}]`;
}

function assertSafeNode(node: unknown): void {
  if (Array.isArray(node)) {
    for (const child of node) assertSafeNode(child);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      assertSafeAttr(key.slice(2), String(value));
      continue;
    }
    if (key === "#text" || key === "#comment") continue;
    if (key.includes(":")) {
      throw new Error(
        `znaki: namespace-prefixed element <${key}> is not supported in icon SVG — export plain SVG without editor namespaces`,
      );
    }
    const local = key;
    const tag = local.toLowerCase();
    if (REJECTED_ELEMENT[tag]) {
      if (tag === "style") {
        throw new Error("znaki: <style> elements are not supported in icons — move presentation attributes inline instead");
      }
      throw new Error(`znaki: <${local}> elements are not allowed in icon SVG`);
    }
    assertSafeNode(value);
  }
}

function assertSafeAttr(name: string, value: string): void {
  if (name.includes(":")) {
    const prefix = name.slice(0, name.indexOf(":"));
    if (prefix !== "xmlns" && prefix !== "xml" && prefix !== "xlink") {
      throw new Error(
        `znaki: namespace prefix "${prefix}" on attribute "${name}" is not supported in icon SVG — export plain SVG without editor namespaces`,
      );
    }
  }
  const local = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
  const lower = local.toLowerCase();
  if (lower.startsWith("on")) {
    throw new Error(`znaki: event handler attribute "${name}" is not allowed in icon SVG`);
  }
  if ((lower === "href" || lower === "src") && UNSAFE_HREF_RE.test(value)) {
    throw new Error(`znaki: unsafe "${name}" URL is not allowed in icon SVG`);
  }
}

function resolveViewBox(viewBox: string | undefined, width: string | undefined, height: string | undefined): string {
  if (viewBox !== undefined) {
    if (!isUsableViewBox(viewBox)) {
      throw new Error(
        `znaki: invalid viewBox ${JSON.stringify(viewBox)} — expected "min-x min-y width height" with positive width and height`,
      );
    }
    return viewBox.trim();
  }
  const w = parseLength(width);
  const h = parseLength(height);
  if (w === null || h === null) {
    throw new Error('znaki: <svg> has no viewBox and no numeric width/height — add viewBox="0 0 <width> <height>" to the icon');
  }
  return `0 0 ${w} ${h}`;
}

function isUsableViewBox(viewBox: string): boolean {
  if (!VIEWBOX_RE.test(viewBox)) return false;
  const parts = viewBox
    .split(/[\s,]+/)
    .filter((part) => part.length > 0)
    .map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0;
}

function parseLength(value: string | undefined): string | null {
  if (value === undefined) return null;
  const match = LENGTH_RE.exec(value);
  if (!match) return null;
  const num = Number(match[1]);
  return num > 0 && Number.isFinite(num) ? String(num) : null;
}

/** Inner markup of the single `<svg>` root, located outside comments/PIs/CDATA. */
function sliceInnerMarkup(source: string): string {
  const blanked = source.replace(NON_MARKUP_RE, (match) => " ".repeat(match.length));
  const open = /<svg(?=[\s/>])/.exec(blanked);
  if (!open) throw new Error("znaki: invalid SVG — no <svg> root element");
  let end = -1;
  let quote = "";
  for (let i = open.index + 4; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error("znaki: invalid SVG — unclosed <svg> tag");
  if (source[end - 1] === "/") return "";
  const closeMatches = [...blanked.matchAll(/<\/svg\s*>/g)];
  const close = closeMatches.length > 0 ? closeMatches[closeMatches.length - 1].index : -1;
  if (close === -1 || close < end) throw new Error("znaki: invalid SVG — missing </svg>");
  return source.slice(end + 1, close);
}

/** Serialize one icon as a namespaced `<symbol>`; inner ids are prefixed with the symbol id. */
export function symbolMarkup(name: string, data: IconData): string {
  const id = symbolId(name);
  const attrs = Object.entries(data.attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join("");
  return `<symbol id="${id}" xmlns="${SVG_NS}" viewBox="${escapeAttr(data.viewBox)}"${attrs}>${prefixIds(data.body, id)}</symbol>`;
}

/** Serialize a sprite document from decoupled icon entries (no registry coupling). */
export function spriteMarkup(entries: Iterable<[string, IconData]>): string {
  let symbols = "";
  for (const [name, data] of entries) symbols += symbolMarkup(name, data);
  return `<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}">${symbols}</svg>`;
}

function escapeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
