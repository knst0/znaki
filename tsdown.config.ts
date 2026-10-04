import { copyFileSync, mkdirSync } from "node:fs";

import { defineConfig } from "tsdown";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/vite/index.ts"],
    outDir: "dist",
    format: "esm",
    platform: "node",
    dts: true,
    fixedExtension: false,
    deps: { neverBundle: ["vite"] },
    hooks: {
      "build:done": () => {
        mkdirSync("dist", { recursive: true });
        copyFileSync("src/virtual.d.ts", "dist/client.d.ts");
      },
    },
  },
  {
    entry: ["src/runtime/index.ts"],
    outDir: "dist/runtime",
    format: "esm",
    platform: "neutral",
    dts: true,
    fixedExtension: false,
    deps: { neverBundle: ["znaki", /^virtual:znaki/] },
  },
]);
