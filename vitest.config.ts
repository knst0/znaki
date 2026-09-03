import { resolve } from "node:path";

import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const virtualStubs = resolve(root, "test/fixtures/virtual.ts");

const VITE = process.env.VITE_DEPENDENCY ?? "vite";

const viteAlias: Record<string, string> =
  VITE === "vite"
    ? {}
    : {
        vite: VITE,
        "vite/module-runner": `${VITE}/module-runner`,
      };

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/*.test.ts"],
        },
      },
      {
        resolve: { alias: viteAlias },
        test: {
          name: "vite",
          environment: "node",
          include: ["test/vite/*.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        plugins: [solid()],
        resolve: {
          alias: {
            znaki: resolve(root, "src/index.ts"),
            "virtual:znaki/sprite": virtualStubs,
            "virtual:znaki/registry": virtualStubs,
          },
        },
        test: {
          name: "solid",
          environment: "happy-dom",
          include: ["test/solid/*.test.tsx"],
        },
      },
    ],
  },
});
