/**
 * Collision-free `symbolId` for icon names.
 *
 * Every ASCII letter/digit passes through verbatim; every other code point
 * (including `-`, `_`, `:`, `/`, space and non-ASCII) becomes `_` + lowercase
 * hex + `_`. Literal `_` encodes as `_5f_`, so output `_` sequences can only
 * come from encoding and the mapping is injective: distinct names always
 * yield distinct ids (e.g. `local:brand/x` vs `local:brand-x`).
 *
 * Output is ASCII (`znaki-` prefix plus `[A-Za-z0-9_]` and hex digits), safe
 * for `id` attributes and `url(#…)` / `href="#…"` fragment references.
 */
export function symbolId(name: string): string {
  let encoded = "";
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      encoded += char;
    } else {
      encoded += `_${code.toString(16)}_`;
    }
  }
  return `znaki-${encoded}`;
}
