import type { Plugin } from "vite";

import { compileIcons } from "../../src/vite/compiler.ts";

/** Exercise the backend-independent compiler with the real framework transform. */
export function compilerPlugin(): Plugin {
  return {
    name: "znaki-compiler-contract",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".tsx") || id.includes("node_modules") || id.startsWith("\0")) return null;
      const result = compileIcons(code, id);
      return result ? { code: result.code, map: result.map } : null;
    },
  };
}
