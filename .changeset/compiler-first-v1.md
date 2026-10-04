---
"znaki": major
---

Rewrite znaki as a compiler-first icon pipeline for v1.

- Import `Icon` and `PreloadSprite` directly from `znaki`. They are compile-time JSX intrinsics, not runtime component values. Remove `target`: the compiler always emits ordinary SVG/use JSX, without framework runtime imports. Generated declarations contain only the icon catalogue; `IconAttributes` supports type-only native SVG augmentation.
- Remove `znaki/react`, `znaki/solid`, their framework peer dependencies, the `component` and `dynamic` options, and `virtual:znaki/icon/*`. Register znaki before the framework compiler.
- Replace arbitrary JavaScript inference and unrelated string-literal harvesting with literal/finite-conditional discovery and explicit `includeIcons` / `lazyIcons` patterns. Exact names match exactly; `*` is the only wildcard. Static delivery wins over lazy delivery.
- Finalize two SVG files from a shared manifest after module discovery, before chunk hashing: the main sprite and one separate lazy sprite, loaded in full by the browser on first use. Remove JS icon chunks and sharding. Support Vite 7 and 8, relative base URLs and source catalogue hot updates.
- Reject unknown static names in production and ambiguous source names unless `allowOverrides: true` explicitly selects first-source-wins resolution.
- Add `library<T>()` for custom catalogues with user-defined `list`, `load` and `parse` callbacks. Parsers return SVG markup or `IconData`; normalization, generated names, sprite delivery and watched catalogue reloads are shared with built-in sources. Remove custom template scanners; only JSX sources are supported.
- Add `lucide()` backed by the optional `lucide-static` package, with a configurable prefix and the same delivery pipeline. No `lucide-react` dependency is required.
- Validate SVG XML and dimensions rather than assuming 24×24. Reject unsupported active content, generate collision-free symbol IDs, and scope definitions within sprite symbols. Every icon uses SVG/use, with no inline-markup or framework-specific lazy renderer.
- Keep `znaki/runtime` framework-neutral with synchronous `spriteHref` lookup for the main and lazy sprites. Remove `loadIcon`, `isSpriteName`, `scopeIcon` and `shardKey`.

See the README for setup, custom-library examples, supported SVG constructs and migration from v0.
