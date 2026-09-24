# znaki

## 0.4.0

### Minor Changes

- 7c47d76: Stop shipping the whole icon set when a dynamic `<Icon name={...}>` is found. Icon names written as string literals anywhere in the scanned files now go into the sprite, the registry only covers template-literal heads and the `dynamic` allowlist (now `[]` by default), sprite icons are left out of it, and the build warning about dynamic usage is gone. Pass `dynamic: [""]` to get the old behaviour back.

## 0.3.0

### Minor Changes

- ebb3f75: Skip `build.outDir` and the usual output directories while scanning the project, add an `exclude` option, and walk the file tree asynchronously.

### Patch Changes

- b00023d: Serve the dev sprite endpoint when a non-root `base` is configured.
- 5ed92d0: Resolve icon names from `export const` declarations instead of treating them as dynamic.
- 81a19ef: Normalize collected file paths and source directories so icon tracking and invalidation work on Windows.
- 61af8f1: Prefix ids inside sprite symbols with the symbol id, so gradients and clip paths from different icons no longer collide.
- 82c5d51: Convert hyphenated SVG attributes to camelCase in the React `Icon`, removing the invalid DOM property warnings for registry icons.
- f28b8c8: Resolve icon names in `map`/`forEach`/`flatMap` callbacks over constant arrays and in constants declared inside functions, instead of falling back to the dynamic registry.
- 2493b1e: Collect icons from every AST node, including arrays, objects, `switch`, `try`, classes, assignments and plain function calls.
- f6a0aac: Render sprite icons in React without a `Suspense` boundary.
- b8e722a: Skip symlinks while collecting source files, so link cycles and broken links no longer crash `buildStart`.
- e809ef2: Declare the `xlink` namespace on the sprite root so icons using `xlink:href` no longer break the whole sprite.
- 8a9ad88: Warn once per file and icon about unresolved names, and escape regex characters in the `component` option.
- 87beae3: Warn during build when an icon is discovered after the sprite has already been emitted.

## 0.2.0

### Minor Changes

- c0edd8b: Remove the `data` prop from the Solid `Icon` component. Icons are now always resolved from the sprite or the generated registry.
- bd14d18: Make `vite` to be non-optional peer dependency.
- e5e0d5c: Add React support. `znaki/react` exports the same `Icon` and `PreloadSprite` components as `znaki/solid`, with `react` as a new optional peer dependency.

### Patch Changes

- 73415bc: Support Vite 8 (rolldown). Inline icon data is now injected as a local `const __znaki_N` binding in the transformed module instead of an import from the `virtual:znaki/icon/*` module, so the `data` prop binding stays stable under rolldown's renaming. The sprite asset source is now passed directly to `emitFile` instead of `setAssetSource` in `renderStart`.

## 0.1.2

### Patch Changes

- 3daa7ef: fix: make `Icon` name type-safe — declare `IconNameMap` in the package entry so the generated `declare module "znaki"` augmentation merges and `IconName` narrows to the collected icon names instead of `string`

## 0.1.1

### Patch Changes

- ecee0b6: Fix sprite icons rendering as empty. `<use>` referenced a same-document fragment (`#icon-id`) while the sprite is served as an external file, so no symbol was ever resolved.

## 0.1.0

### Minor Changes

- 16b83d6: Initial release: typesafe SVG icons for Vite with sprite and inline modes, Tabler and local sources, and generated icon name types.
