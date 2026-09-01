import type { IconData } from "../types.ts";

const SVG_RE = /<svg([^>]*)>([\s\S]*)<\/svg>/;
const ATTR_RE = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/g;
const DROPPED_ATTRS = new Set(["width", "height", "class", "id", "xmlns", "xmlns:xlink", "version", "viewbox"]);

export function parseSvg(source: string): IconData | null {
  const match = SVG_RE.exec(source);
  if (!match) return null;

  const attrs: Record<string, string> = {};
  let viewBox = "0 0 24 24";

  for (const attr of match[1].matchAll(ATTR_RE)) {
    const key = attr[1];
    const value = attr[2].slice(1, -1);
    if (key.toLowerCase() === "viewbox") viewBox = value;
    else if (!DROPPED_ATTRS.has(key.toLowerCase())) attrs[key] = value;
  }

  return { body: match[2].trim(), viewBox, attrs };
}
