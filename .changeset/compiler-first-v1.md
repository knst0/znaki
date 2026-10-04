---
"znaki": major
---

Rewrite znaki as a compiler-first icon pipeline for v1.

- Import `Icon` and `PreloadSprite` directly from `znaki`. They are compile-time JSX intrinsics, not runtime component values. Select `target: "react" | "solid" | "reze"`; generated declarations use the selected framework's native SVG props and JSX result types.
- Remove `znaki/react`, `znaki/solid`, their framework peer dependencies, the `component` and `dynamic` options, and `virtual:znaki/icon/*`. Register znaki before the framework compiler.
- Replace arbitrary JavaScript inference and unrelated string-literal harvesting with literal/finite-conditional discovery and explicit `includeIcons` / `lazyIcons` patterns. Exact names match exactly; `*` is the only wildcard. Static delivery wins over lazy delivery.
- Finalize sprite and lazy payloads from a shared manifest after module discovery, before chunk hashing. Support Vite 7 and 8, relative base URLs, generated-module refresh, and source catalogue hot updates.
- Reject unknown static names in production and ambiguous source names unless `allowOverrides: true` explicitly selects first-source-wins resolution.
- Add `library<T>()` for custom catalogues with user-defined `list`, `load` and `parse` callbacks. Parsers return SVG markup or `IconData`; normalization, generated names, sprite/lazy delivery and watched catalogue reloads are shared with built-in sources. Preserve the separate `FrameworkIntegration` source-scanner contract.
- Add `lucide()` backed by the optional `lucide-static` package, with a configurable prefix and the same delivery pipeline. No `lucide-react` dependency is required.
- Validate SVG XML and dimensions rather than assuming 24×24. Reject unsupported active content, generate collision-free symbol IDs, and scope inline definitions per rendered instance. The reze lazy backend is client-rendered; use sprite delivery for server-rendered reze icons.
- Keep `znaki/runtime` framework-neutral with promise-cached lazy loading, validated sprite lookup and `scopeIcon` for custom renderers.

See the README for setup, custom-library examples, supported SVG constructs and migration from v0.
