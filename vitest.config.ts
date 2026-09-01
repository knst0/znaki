import { resolve } from "node:path";

import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["test/*.test.ts"],
        },
      },
      {
        plugins: [solid()],
        resolve: {
          alias: {
            znaki: resolve(import.meta.dirname, "src/index.ts"),
            "virtual:znaki/sprite": resolve(import.meta.dirname, "test/solid/stubs.ts"),
            "virtual:znaki/registry": resolve(import.meta.dirname, "test/solid/stubs.ts"),
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
