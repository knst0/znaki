import { resolve } from "node:path";

import solid from "@solidjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { compilerPlugin } from "./test/helpers/compiler.ts";

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
        plugins: [compilerPlugin(), solid()],
        resolve: {
          alias: {
            "znaki/runtime": resolve(root, "src/runtime/index.ts"),
            znaki: resolve(root, "src/index.ts"),
            "virtual:znaki/sprite": virtualStubs,
          },
        },
        test: {
          name: "solid",
          environment: "happy-dom",
          include: ["test/solid/*.test.tsx"],
        },
      },
      {
        plugins: [compilerPlugin(), react({ jsxImportSource: "react" })],
        resolve: {
          alias: {
            "znaki/runtime": resolve(root, "src/runtime/index.ts"),
            znaki: resolve(root, "src/index.ts"),
            "virtual:znaki/sprite": virtualStubs,
          },
        },
        test: {
          name: "react",
          environment: "happy-dom",
          setupFiles: ["test/helpers/react-env.ts"],
          include: ["test/react/*.test.tsx"],
        },
      },
      {
        resolve: {
          alias: {
            "znaki/runtime": resolve(root, "src/runtime/index.ts"),
            znaki: resolve(root, "src/index.ts"),
            "virtual:znaki/sprite": virtualStubs,
          },
        },
        test: {
          name: "runtime",
          environment: "node",
          include: ["test/runtime/*.test.ts"],
        },
      },
    ],
  },
});
