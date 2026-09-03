# znaki

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
