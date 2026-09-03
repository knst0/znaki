import type { IconData } from "../../src/types.ts";

export const SVG = `<svg viewBox="0 0 16 16"><path/></svg>`;

export const SVG_ATTRS = `<svg viewBox="0 0 16 16" fill="none"><path d="M1 1"/></svg>`;

export const ICONS: Record<string, IconData> = {
  home: { body: `<path d="M1 1"/>`, viewBox: "0 0 16 16", attrs: { fill: "none" } },
  user: { body: "<circle/>", viewBox: "0 0 24 24", attrs: {} },
  quoted: { body: "<g/>", viewBox: "0 0 2 2", attrs: { title: `a "b" & <c>` } },
};

export const iconData = (viewBox: string): IconData => ({ body: "<path/>", viewBox, attrs: {} });
