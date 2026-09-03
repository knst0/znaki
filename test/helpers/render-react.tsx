import { act } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach } from "vitest";

const roots: Root[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.innerHTML = "";
  for (const link of document.head.querySelectorAll("link")) link.remove();
});

export async function mount(element: ReactElement): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(element));
  return host;
}

export function svg(host: HTMLElement): SVGSVGElement {
  const element = host.querySelector("svg");
  if (!element) throw new Error("no svg rendered");
  return element;
}
