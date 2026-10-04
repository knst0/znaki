/**
 * Framework-independent SVG prop resolution for compiled `<Icon>` output.
 *
 * Pure object operations only: no framework imports, no DOM access, no
 * reactivity primitives. Safe to call inside any JSX spread effect in
 * React, Solid, or other JSX runtimes.
 *
 * Strips the compile-time `name` / `size` props, resolves `width` and
 * `height` (explicit wins, then `size`, then `"1em"`), and defaults
 * `aria-hidden` to `"true"` unless the icon is labelled
 * (`aria-label` / `aria-labelledby`) or `aria-hidden` is set explicitly.
 * When `renderUse` is given, its result (the caller-built `<use>` element
 * for the resolved `name`) is installed as `children`, so the merged prop
 * object evaluates once per framework spread update and the `<svg>` /
 * `<use>` pair stays in one reactive binding.
 */
export function svgProps(props: Record<string, unknown>, renderUse?: (name: string) => unknown): Record<string, unknown> {
  const { name, size, width, height, ...rest } = props as Record<string, unknown> & {
    name?: unknown;
    size?: unknown;
    width?: unknown;
    height?: unknown;
  };
  const resolvedWidth = (width ?? size ?? "1em") as unknown;
  const resolvedHeight = (height ?? size ?? "1em") as unknown;
  const out: Record<string, unknown> = { width: resolvedWidth, height: resolvedHeight, ...rest };
  if (!("aria-hidden" in rest) && !("aria-label" in rest) && !("aria-labelledby" in rest)) {
    out["aria-hidden"] = "true";
  }
  if (renderUse) out["children"] = renderUse(name as string);
  return out;
}
