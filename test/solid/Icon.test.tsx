import { render } from "@solidjs/web";
import { afterEach, describe, expect, it } from "vitest";

import { Icon } from "../../src/solid/Icon.tsx";
import { PreloadSprite } from "../../src/solid/PreloadSprite.tsx";
import { lazyIcon, spriteUrl } from "./stubs.ts";

const disposers: (() => void)[] = [];

function mount(component: () => unknown): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  disposers.push(render(component as never, host));
  return host;
}

function svg(host: HTMLElement): SVGSVGElement {
  const element = host.querySelector("svg");
  if (!element) throw new Error("no svg rendered");
  return element;
}

async function flush(): Promise<void> {
  await new Promise((done) => setTimeout(done, 0));
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.innerHTML = "";
});

describe("Icon: sprite mode", () => {
  it("references the sprite symbol through use", () => {
    const host = mount(() => <Icon name="i:sprited" />);

    expect(svg(host).querySelector("use")?.getAttribute("href")).toBe(`${spriteUrl}#znaki-i-sprited`);
  });

  it("does not set a viewBox of its own", () => {
    const host = mount(() => <Icon name="i:sprited" />);

    expect(svg(host).hasAttribute("viewBox")).toBe(false);
  });
});

describe("Icon: lazy registry", () => {
  it("loads a non-sprite icon from the registry", async () => {
    const host = mount(() => <Icon name="i:lazy" />);
    await flush();

    expect(svg(host).getAttribute("viewBox")).toBe(lazyIcon.viewBox);
    expect(svg(host).getAttribute("fill")).toBe("red");
    expect(svg(host).querySelector("g > circle")?.getAttribute("r")).toBe("1");
    expect(svg(host).querySelector("use")).toBeNull();
  });

  it("falls back to the sprite reference for an unknown name", async () => {
    const host = mount(() => <Icon name="i:missing" />);
    await flush();

    expect(svg(host).querySelector("use")?.getAttribute("href")).toBe(`${spriteUrl}#znaki-i-missing`);
  });
});

describe("Icon: props", () => {
  it("defaults to a 1em square", () => {
    const element = svg(mount(() => <Icon name="i:sprited" />));

    expect(element.getAttribute("width")).toBe("1em");
    expect(element.getAttribute("height")).toBe("1em");
  });

  it("applies a numeric size to both dimensions", () => {
    const element = svg(mount(() => <Icon name="i:sprited" size={24} />));

    expect(element.getAttribute("width")).toBe("24");
    expect(element.getAttribute("height")).toBe("24");
  });

  it("hides the icon from assistive tech by default", () => {
    expect(svg(mount(() => <Icon name="i:sprited" />)).getAttribute("aria-hidden")).toBe("true");
  });

  it("is exposed when an aria-label is given", () => {
    const element = svg(mount(() => <Icon name="i:sprited" aria-label="Home" />));

    expect(element.hasAttribute("aria-hidden")).toBe(false);
    expect(element.getAttribute("aria-label")).toBe("Home");
  });

  it("forwards arbitrary svg attributes", () => {
    const element = svg(mount(() => <Icon name="i:sprited" class="icon" data-testid="x" />));

    expect(element.getAttribute("class")).toBe("icon");
    expect(element.getAttribute("data-testid")).toBe("x");
  });

  it("lets explicit props win over the icon data attrs", async () => {
    const host = mount(() => <Icon name="i:lazy" fill="currentColor" />);
    await flush();

    expect(svg(host).getAttribute("fill")).toBe("currentColor");
  });

  it("does not leak its own props onto the svg", () => {
    const element = svg(mount(() => <Icon name="i:sprited" size={16} />));

    expect(element.hasAttribute("name")).toBe(false);
    expect(element.hasAttribute("size")).toBe(false);
  });
});

describe("PreloadSprite", () => {
  it("renders a preload link for the sprite", () => {
    const link = mount(() => <PreloadSprite />).querySelector("link");

    expect(link?.getAttribute("rel")).toBe("preload");
    expect(link?.getAttribute("as")).toBe("image");
    expect(link?.getAttribute("type")).toBe("image/svg+xml");
    expect(link?.getAttribute("href")).toBe(spriteUrl);
  });
});
