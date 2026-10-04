/**
 * Shared build/runtime string helper for namespacing SVG inner ids.
 *
 * Pure string transform with no DOM or XML-library dependency, so both the
 * Vite sprite backend (`src/vite/svg.ts`) and framework runtimes rendering
 * lazy icon data inline can use it: each rendered copy gets its own `prefix`
 * (sprite symbol id, or a per-instance unique id), keeping `id` definitions
 * and their `url(#…)` / `href="#…"` / ARIA IDREF references consistent
 * within that copy.
 *
 * Operates on real markup structure, not raw text: a small tokenizer walks
 * tags while respecting quotes, comments, CDATA and processing instructions,
 * so `id="…"` inside text nodes, comments or other attribute values is never
 * mistaken for a definition. Attribute values are entity-decoded before
 * comparison (so `id="a&#38;b"` matches `href="#a&amp;b"`) and re-encoded
 * canonically with double quotes on rewritten tags; untouched tags pass
 * through byte-identical.
 *
 * Rewrites (single- and double-quoted forms):
 * - `id` definitions,
 * - `url(#id)` references, quoted or not, in any attribute value,
 * - `href` / `xlink:href` pure-fragment references,
 * - `aria-labelledby` / `aria-describedby` space-separated id lists.
 *
 * Only references matching an id defined in the same markup are rewritten;
 * external references (other files, absolute URLs) pass through untouched.
 *
 * Explicitly out of scope and rejected: `<style>` elements (CSS `#id`
 * selectors cannot be namespaced by rewriting) and SMIL syncbase/event
 * references in `begin`/`end` (e.g. `begin="btn.click"`), which would
 * silently dangle after prefixing.
 */

const HREF_ATTR: Record<string, true> = { href: true, "xlink:href": true };
const ARIA_ATTR: Record<string, true> = { "aria-labelledby": true, "aria-describedby": true };
const TIMING_ATTR: Record<string, true> = { begin: true, end: true };

const STYLE_MESSAGE = "znaki: <style> elements are not supported in icons — move presentation attributes inline instead";

const ATTR_RE = /([^\s=/>]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]*))?/g;
const URL_REF_RE = /url\s*\(\s*(["']?)#([^"'()\s]+)\1\s*\)/gi;
const SMIL_REF_RE = /(^|[;\s])[\w.-]+\.(begin|end|click|mousedown|mouseup|mouseover|mouseout|focusin|focusout|activate)(?![\w.-])/i;
const ENTITY_RE = /&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g;

const NAMED_ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

interface ParsedAttr {
  name: string;
  value: string;
  bare: boolean;
}

interface TagOccurrence {
  start: number;
  end: number;
  close: boolean;
  name: string;
  attrs: ParsedAttr[];
  selfClosing: boolean;
}

export function prefixIds(body: string, prefix: string): string {
  const tags = scanTags(body);
  const ids = new Set<string>();
  for (const tag of tags) {
    const local = tag.name.includes(":") ? tag.name.slice(tag.name.lastIndexOf(":") + 1) : tag.name;
    if (!tag.close && local.toLowerCase() === "style") throw new Error(STYLE_MESSAGE);
    if (tag.close) continue;
    for (const attr of tag.attrs) {
      if (!attr.bare && attr.name === "id" && attr.value !== "") ids.add(attr.value);
    }
  }

  let out = "";
  let pos = 0;
  for (const tag of tags) {
    out += body.slice(pos, tag.start);
    pos = tag.end;
    if (tag.close) {
      out += body.slice(tag.start, tag.end);
      continue;
    }
    const local = tag.name.includes(":") ? tag.name.slice(tag.name.lastIndexOf(":") + 1) : tag.name;
    if (local.toLowerCase() === "style") throw new Error(STYLE_MESSAGE);
    const rewritten = rewriteTag(tag, prefix, ids);
    out += rewritten === null ? body.slice(tag.start, tag.end) : rewritten;
  }
  return out + body.slice(pos);
}

function rewriteTag(tag: TagOccurrence, prefix: string, ids: Set<string>): string | null {
  let changed = false;
  const parts: string[] = [];
  for (const attr of tag.attrs) {
    let value = attr.value;
    if (!attr.bare) {
      if (attr.name === "id") {
        if (value !== "" && ids.has(value)) {
          value = `${prefix}-${value}`;
          changed = true;
        }
      } else if (HREF_ATTR[attr.name]) {
        const frag = pureFragment(value);
        if (frag !== null && ids.has(frag)) {
          value = `#${prefix}-${frag}`;
          changed = true;
        }
      } else if (ARIA_ATTR[attr.name]) {
        const tokens = value.split(/\s+/).filter((token) => token !== "");
        if (tokens.some((token) => ids.has(token))) {
          value = tokens.map((token) => (ids.has(token) ? `${prefix}-${token}` : token)).join(" ");
          changed = true;
        }
      } else {
        if (TIMING_ATTR[attr.name] && SMIL_REF_RE.test(value)) {
          throw new Error(`znaki: SMIL timing references (${attr.name}="${value}") are not supported in icons — use static shapes instead`);
        }
        const rewritten = rewriteUrls(value, prefix, ids);
        if (rewritten !== value) {
          value = rewritten;
          changed = true;
        }
      }
    }
    parts.push(attr.bare ? attr.name : `${attr.name}="${encodeAttr(value)}"`);
  }
  if (!changed) return null;
  return `<${tag.name}${parts.length > 0 ? ` ${parts.join(" ")}` : ""}${tag.selfClosing ? "/" : ""}>`;
}

function pureFragment(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2 || !trimmed.startsWith("#")) return null;
  const frag = trimmed.slice(1);
  return /[\s#]/.test(frag) || frag === "" ? null : frag;
}

function rewriteUrls(value: string, prefix: string, ids: Set<string>): string {
  return value.replace(URL_REF_RE, (match, _quote: string, id: string) => (ids.has(id) ? `url(#${prefix}-${id})` : match));
}

function scanTags(body: string): TagOccurrence[] {
  const tags: TagOccurrence[] = [];
  let i = 0;
  while (i < body.length) {
    const lt = body.indexOf("<", i);
    if (lt === -1) break;
    if (body.startsWith("<!--", lt)) {
      const end = body.indexOf("-->", lt + 4);
      i = end === -1 ? body.length : end + 3;
      continue;
    }
    if (body.startsWith("<![CDATA[", lt)) {
      const end = body.indexOf("]]>", lt + 9);
      i = end === -1 ? body.length : end + 3;
      continue;
    }
    if (body.startsWith("<?", lt)) {
      const end = body.indexOf("?>", lt + 2);
      i = end === -1 ? body.length : end + 2;
      continue;
    }
    if (body.startsWith("<!", lt)) {
      const end = findTagEnd(body, lt + 2);
      i = end === -1 ? body.length : end + 1;
      continue;
    }
    const end = findTagEnd(body, lt + 1);
    if (end === -1) break;
    const occurrence = parseTag(body, lt, end);
    if (occurrence) tags.push(occurrence);
    i = end + 1;
  }
  return tags;
}

function findTagEnd(body: string, from: number): number {
  let quote = "";
  for (let j = from; j < body.length; j++) {
    const char = body[j];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return j;
    }
  }
  return -1;
}

function parseTag(body: string, lt: number, end: number): TagOccurrence | null {
  let inner = body.slice(lt + 1, end);
  let close = false;
  if (inner.startsWith("/")) {
    close = true;
    inner = inner.slice(1);
  }
  const trimmed = inner.trimStart();
  const nameMatch = /^[^\s/>]+/.exec(trimmed);
  if (!nameMatch) return null;
  const name = nameMatch[0];
  let rest = trimmed.slice(name.length);
  let selfClosing = false;
  if (!close && rest.trimEnd().endsWith("/")) {
    selfClosing = true;
    rest = rest.trimEnd().slice(0, -1);
  }
  const attrs: ParsedAttr[] = [];
  if (!close) {
    ATTR_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ATTR_RE.exec(rest)) !== null) {
      const attrName = match[1];
      const assigned = match[2];
      if (assigned === undefined) {
        attrs.push({ name: attrName, value: "", bare: true });
        continue;
      }
      const raw = assigned.replace(/^\s*=\s*/, "");
      const quoted = raw.startsWith('"') || raw.startsWith("'");
      attrs.push({
        name: attrName,
        value: decodeEntities(quoted ? raw.slice(1, -1) : raw),
        bare: false,
      });
    }
  }
  return { start: lt, end: end + 1, close, name, attrs, selfClosing };
}

function decodeEntities(value: string): string {
  return value.replace(ENTITY_RE, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = entity[1] === "x" || entity[1] === "X";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isSafeInteger(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const known = NAMED_ENTITY[entity];
    return known === undefined ? match : known;
  });
}

// Mirrors escapeAttr in src/vite/svg.ts (kept separate: this module must stay
// free of build-only imports so framework runtimes can share it).
function encodeAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
