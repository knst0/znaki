import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 140,
  sortImports: true,
  sortPackageJson: {
    sortScripts: true,
  },
});
