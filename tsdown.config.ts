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
  {
    entry: ["src/solid/index.ts"],
    outDir: "dist/solid",
    format: "esm",
    platform: "neutral",
    dts: true,
    fixedExtension: false,
    deps: { neverBundle: ["solid-js", "@solidjs/web", "znaki", "znaki/runtime", /^virtual:znaki/] },
    outputOptions: { entryFileNames: "[name].jsx" },
  },
  {
    entry: ["src/react/index.ts"],
    outDir: "dist/react",
    tsconfig: "tsconfig.react.json",
    format: "esm",
    platform: "neutral",
    dts: true,
    fixedExtension: false,
    deps: { neverBundle: ["react", "react/jsx-runtime", "znaki", "znaki/runtime", /^virtual:znaki/] },
  },
]);
