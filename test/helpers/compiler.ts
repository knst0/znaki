import { resolve } from "node:path";

import type { Plugin } from "vite";

import { compileIcons, componentModule } from "../../src/vite/compiler.ts";

/** Exercise the compiler with each real framework transform and controlled icon delivery. */
export function compilerPlugin(target: "react" | "solid"): Plugin {
  const componentPath = resolve(import.meta.dirname, `znaki-${target}.tsx`);
  return {
    name: "znaki-compiler-contract",
    enforce: "pre",
    resolveId(id) {
      if (id === "virtual:znaki/component" || id === componentPath) return componentPath;
      return null;
    },
    load(id) {
      if (id === componentPath) return componentModule(target);
      return null;
    },
    transform(code, id) {
      if (!id.endsWith(".tsx") || id.includes("node_modules") || id.startsWith("\0")) return null;
      const result = compileIcons(code, id, { target, lazy: true });
      return result ? { code: result.code, map: result.map } : null;
    },
  };
}
