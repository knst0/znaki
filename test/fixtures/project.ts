import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach } from "vitest";

export interface Project {
  readonly root: string;
  file: (relative: string, content: string) => string;
}

export function useProject(prefix = "znaki"): Project {
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), `${prefix}-`));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    root = "";
  });

  return {
    get root() {
      return root;
    },
    file(relative, content) {
      const path = join(root, relative);
      mkdirSync(resolve(path, ".."), { recursive: true });
      writeFileSync(path, content);
      return path;
    },
  };
}
