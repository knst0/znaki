---
"znaki": major
---

znaki v1 compiles icon JSX into ordinary `<svg><use /></svg>` elements and serves icons through shared SVG sprites. The compiler and runtime are framework-independent.

### Breaking changes and migration

- Import `Icon` and `PreloadSprite` from `znaki`, not `znaki/react` or `znaki/solid`. They are compile-time JSX intrinsics, not runtime component values. The framework-specific entry points and framework peer dependencies are removed.
- Remove `target` and register znaki before your framework's JSX compiler. Replace `component: "MyIcon"` with an aliased import such as `import { Icon as MyIcon } from "znaki"`. Custom framework/template scanners are removed; only JSX sources are supported.
- Replace `dynamic` prefixes with explicit `includeIcons` or `lazyIcons` patterns. Exact names match exactly, and `*` is the only wildcard. Discovery covers literal names and finite conditional expressions, not arbitrary JavaScript inference or unrelated string literals.
- Regenerate `znaki.d.ts`. Generated declarations describe the icon catalogue; use type-only `IconAttributes` augmentation for framework-native SVG attributes.
- Replace `loadIcon`, `isSpriteName`, `scopeIcon` and shard-based integrations with synchronous `spriteHref(name)` from `znaki/runtime` when constructing `<use>` references manually. The `virtual:znaki/icon/*` modules, JS icon chunks, sharding and framework-specific lazy renderers are removed.
- Provide valid SVG dimensions through a `viewBox` or positive numeric `width` and `height`. SVG XML and dimensions are validated instead of assuming a 24×24 viewBox, and unsupported active content is rejected.
- Resolve duplicate icon names across sources, or set `allowOverrides: true` to explicitly prefer the first source. Unknown static names and missing exact names in delivery lists warn in development and fail production builds.

### Icon delivery and diagnostics

- Statically discovered icons and `includeIcons` populate the main sprite. `lazyIcons` populates one separate SVG sprite, which the browser loads in full on first use. Static delivery takes precedence when an icon matches both lists. `PreloadSprite` preloads only the main sprite.
- Dynamic icon names without either delivery list emit a warning with the source location and configuration guidance, deduplicated per source file. Dynamic usage does not automatically include the whole catalogue; TypeScript name checking does not configure delivery.
- Both sprites are finalized from a shared manifest after module discovery and before chunk hashing. Vite 7 and 8, relative base URLs and source-catalogue hot updates are supported.
- JSX query modules, including filesystem-routing selections such as `index.tsx?pick=default&pick=$css&lang.tsx`, receive the icon transform. Distinct query selections retain their own discovered icons, while `?raw` and `?url` remain asset requests.
- Symbol IDs avoid collisions, and SVG definitions are scoped within each symbol. All icons use external SVG sprites rather than inline-markup renderers.

### New icon sources

- Add `lucide()` backed by the optional `lucide-static` package, with a configurable prefix. No `lucide-react` dependency is required.
- Add `library<T>()` for custom catalogues with `list`, `load` and `parse` callbacks. Parsers return SVG markup or `IconData`; custom sources share normalization, generated names, sprite delivery and watched catalogue reloads with built-in sources.

See the README for setup, migration examples, dynamic-name configuration, custom libraries and supported SVG constructs.
