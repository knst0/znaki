import { render } from "@solidjs/web";
import { afterEach } from "vitest";

const disposers: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = "";
});

export function mount(component: () => unknown): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(component as never, host));
  return host;
}

export function svg(host: HTMLElement): SVGSVGElement {
  const element = host.querySelector("svg");
  if (!element) throw new Error("no svg rendered");
  return element;
}

export function flush(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}
