import { statSync, utimesSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

import { writeDts } from "../../src/vite/dts.ts";
import { useProject } from "../fixtures/project.ts";

const project = useProject("znaki-dts");

it("does not trigger a declaration file change when the catalogue is unchanged", () => {
  const path = join(project.root, "types", "znaki.d.ts");
  writeDts(path, ["home"]);
  const oldTime = new Date("2020-01-01T00:00:00Z");
  utimesSync(path, oldTime, oldTime);
  writeDts(path, ["home"]);
  expect(statSync(path).mtimeMs).toBe(oldTime.getTime());
});
