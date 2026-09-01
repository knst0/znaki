# znaki

## 0.1.1

### Patch Changes

- ecee0b6: Fix sprite icons rendering as empty. `<use>` referenced a same-document fragment (`#icon-id`) while the sprite is served as an external file, so no symbol was ever resolved.

## 0.1.0

### Minor Changes

- 16b83d6: Initial release: typesafe SVG icons for Vite with sprite and inline modes, Tabler and local sources, and generated icon name types.
