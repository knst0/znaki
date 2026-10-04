import { describe, expect, it } from "vitest";

import { spriteHref, svgProps } from "../../src/runtime/index.ts";
import { lazySpriteUrl, spriteUrl } from "../fixtures/virtual.ts";

describe("spriteHref", () => {
  it("resolves a static icon to the main sprite", () => {
    expect(spriteHref("i:sprited")).toBe(`${spriteUrl}#znaki-i_3a_sprited`);
  });

  it("resolves a lazy icon to the shared lazy sprite", () => {
    expect(spriteHref("i:lazy")).toBe(`${lazySpriteUrl}#znaki-i_3a_lazy`);
  });

  it("rejects an unconfigured name instead of rendering a broken reference", () => {
    expect(() => spriteHref("i:unknown")).toThrow(/znaki: icon "i:unknown"/);
  });
});

describe("svgProps", () => {
  it("strips name and size while defaulting to a 1em square", () => {
    expect(svgProps({ name: "i:sprited", size: 24 })).toEqual({
      width: 24,
      height: 24,
      "aria-hidden": "true",
    });
  });

  it("lets explicit dimensions win over size", () => {
    expect(svgProps({ name: "i:sprited", size: 16, width: 48 }).width).toBe(48);
    expect(svgProps({ name: "i:sprited", size: 16, width: 48 }).height).toBe(16);
  });

  it("omits aria-hidden for labelled icons and preserves an explicit value", () => {
    expect("aria-hidden" in svgProps({ name: "i:sprited", "aria-label": "Home" })).toBe(false);
    expect(svgProps({ name: "i:sprited", "aria-hidden": "false" })["aria-hidden"]).toBe("false");
  });

  it("builds the use element through the children callback", () => {
    const props = svgProps({ name: "i:sprited" }, (name) => `use:${name}`);
    expect(props["children"]).toBe("use:i:sprited");
  });
});
