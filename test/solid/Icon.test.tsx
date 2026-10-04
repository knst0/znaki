import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { Icon, PreloadSprite } from "znaki";
import type { IconName } from "znaki";

import { lazySpriteUrl, spriteUrl } from "../fixtures/virtual.ts";
import { flush, mount, svg } from "../helpers/render.tsx";

const Lazy = (props: { name: IconName; fill?: string }) => <Icon {...props} />;

describe("Icon: sprite mode", () => {
  it("references the sprite symbol through use", () => {
    const host = mount(() => <Icon name="i:sprited" />);

    expect(svg(host).querySelector("use")?.getAttribute("href")).toBe(`${spriteUrl}#znaki-i_3a_sprited`);
  });

  it("does not set a viewBox of its own", () => {
    const host = mount(() => <Icon name="i:sprited" />);

    expect(svg(host).hasAttribute("viewBox")).toBe(false);
  });
});

describe("Icon: lazy sprite", () => {
  it("references the shared lazy sprite symbol through use", () => {
    const host = mount(() => <Lazy name="i:lazy" />);

    expect(svg(host).querySelector("use")?.getAttribute("href")).toBe(`${lazySpriteUrl}#znaki-i_3a_lazy`);
  });

  it("renders no inline body of its own", () => {
    const host = mount(() => <Lazy name="i:lazy" />);

    expect(svg(host).hasAttribute("viewBox")).toBe(false);
    expect(svg(host).querySelector("g")).toBeNull();
    expect(svg(host).querySelector("circle")).toBeNull();
  });
});

describe("compiled reactive props", () => {
  it("updates name and dimensions without capturing initial signal values", async () => {
    function App() {
      const [changed, setChanged] = createSignal(false);
      return (
        <>
          <button onClick={() => setChanged(true)}>Change</button>
          <Icon name={changed() ? "i:alternate" : "i:sprited"} size={changed() ? 32 : 16} width={48} aria-labelledby="label" />
        </>
      );
    }
    const host = mount(() => <App />);
    expect(svg(host).getAttribute("width")).toBe("48");
    expect(svg(host).getAttribute("height")).toBe("16");
    expect(svg(host).hasAttribute("aria-hidden")).toBe(false);
    host.querySelector("button")!.click();
    await flush();
    expect(svg(host).getAttribute("height")).toBe("32");
    expect(svg(host).getAttribute("width")).toBe("48");
    expect(svg(host).querySelector("use")?.getAttribute("href")).toBe(`${spriteUrl}#znaki-i_3a_alternate`);
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
