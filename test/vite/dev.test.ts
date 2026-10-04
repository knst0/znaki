import { afterEach, describe, expect, it } from "vitest";

import { useProject } from "../fixtures/project.ts";
import { memorySource } from "../fixtures/sources.ts";
import { createDevHarness } from "../helpers/dev.ts";
import type { DevHarness } from "../helpers/dev.ts";

const project = useProject("znaki-dev");
let harness: DevHarness | undefined;
afterEach(async () => {
  await harness?.close();
  harness = undefined;
});

describe("development delivery", () => {
  it("serves the discovered sprite under a configured base with SVG content type", async () => {
    project.file("main.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="i:home"/>;`);
    harness = await createDevHarness({ root: project.root, sources: [memorySource()], base: "/app/" });
    await harness.transform("virtual:znaki/sprite");
    const response = await harness.request("/app/@znaki/sprite.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(response.headers.get("cache-control")).toBe("no-cache");
    const body = await response.text();
    expect(body).toContain('id="znaki-i_3a_home"');
    expect(body).not.toContain('id="znaki-i_3a_user"');
  });

  it("discovers a new imported file and makes its symbol available", async () => {
    project.file("main.tsx", `export const n = 1;`);
    harness = await createDevHarness({ root: project.root, sources: [memorySource()] });
    await harness.transform("virtual:znaki/sprite");
    project.file("late.tsx", `import { Icon } from "znaki"; export const C = () => <Icon name="i:user"/>;`);
    await harness.transform("/late.tsx");
    expect(await (await harness.request("/@znaki/sprite.svg")).text()).toContain('id="znaki-i_3a_user"');
  });

  it("serves an explicit lazy set from its own endpoint without a JSX usage", async () => {
    project.file("main.tsx", `export const n = 1;`);
    harness = await createDevHarness({ root: project.root, sources: [memorySource()], options: { lazyIcons: ["i:user"] } });
    const module = await harness.transform("virtual:znaki/sprite");
    expect(module).toContain("lazySpriteUrl");
    expect(module).toContain("i:user");
    const response = await harness.request("/@znaki/lazy.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    const body = await response.text();
    expect(body).toContain('id="znaki-i_3a_user"');
    expect(body).not.toContain('id="znaki-i_3a_home"');
  });
});
