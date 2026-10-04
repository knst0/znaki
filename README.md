# znaki

Typesafe SVG icons for Vite. Framework-independent JSX compilation with Lucide, Tabler, your own SVG files, or a custom icon library. Every icon renders as `<svg><use /></svg>`.

## Quick start

Install znaki and an icon library:

```sh
pnpm add -D znaki lucide-static
```

Add znaki **before your framework plugin** in `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import znaki, { lucide } from "znaki/vite";

export default defineConfig({
  plugins: [
    znaki({
      sources: [lucide()],
    }),
    react(),
  ],
});
```

Use your application's JSX plugin (React, Solid, reze, etc.). znaki does not select a rendering backend or import framework runtime APIs. Only `.jsx` and `.tsx` sources are supported.

Add `"znaki/client"` to your existing TypeScript `types` list and `"znaki.d.ts"` to `include`:

```json
{
  "compilerOptions": { "types": ["znaki/client"] },
  "include": ["src", "znaki.d.ts"]
}
```

Start Vite once to generate `znaki.d.ts`, then use an icon:

```tsx
import { Icon } from "znaki";

<Icon name="lucide:arrow-right" size={24} />;
```

Icon names are autocompleted and checked by TypeScript. Run Vite or a build before typechecking a fresh checkout. Generated declarations contain the icon-name catalogue, not framework-specific types.

## Size, color and accessibility

`Icon` forwards SVG attributes, event handlers and refs to the generated `<svg>`. Its default attribute types are framework-neutral. For native attribute completion and contextual event types, augment `IconAttributes` in your application's declaration file; for example, with React:

```ts
import type { SVGProps } from "react";
import "znaki";

declare module "znaki" {
  interface IconAttributes extends Omit<SVGProps<SVGSVGElement>, "name" | "children" | "dangerouslySetInnerHTML"> {}
}
```

For another JSX implementation, extend its SVG attribute type instead. This is a type-only integration; znaki's compiler and runtime remain unchanged.

```tsx
import { Icon } from "znaki";

// Inherits the surrounding text color; size defaults to 1em.
<Icon name="lucide:heart" />;

// Explicit width and height take precedence over size.
<Icon name="lucide:arrow-right" size={24} width={32} />;

// Give a meaningful standalone icon an accessible name.
<Icon name="lucide:circle-alert" size={20} aria-label="Warning" />;

// A button's text already describes this decorative icon.
<button>
  <Icon name="lucide:save" size={16} />
  Save
</button>;
```

Use `className` in React and `class` in Solid/reze. Lucide and Tabler follow `currentColor`; custom SVGs must use `currentColor` if they should inherit text color.

Icons are hidden from assistive technology unless you supply `aria-label` or `aria-labelledby`. An explicit `aria-hidden` overrides this default.

Use `Icon` directly in JSX. Import aliases are supported, but passing it as a component value, calling it as a function, and re-exporting it through a barrel are not. To make a reusable component, wrap `<Icon>` in your own component. Do not pass children or `innerHTML`/`dangerouslySetInnerHTML` to `Icon`.

### Preload icons

Optionally render `PreloadSprite` once near the top of your page to start loading the shared icon file earlier:

```tsx
import { PreloadSprite } from "znaki";

<PreloadSprite />;
```

It takes no props or children.

## Icon sources

Import sources from `znaki/vite` and add them to `sources`. You can combine several sources.

### Lucide

```sh
pnpm add -D lucide-static
```

```ts
import { lucide } from "znaki/vite";

lucide(); // lucide:arrow-right, lucide:heart, ...
lucide({ prefix: "ui" }); // ui:arrow-right, ui:heart, ...
```

Names use kebab-case. You do not need `lucide-react` or another framework-specific Lucide package.

### Tabler

```sh
pnpm add -D @tabler/icons
```

```ts
import { tabler } from "znaki/vite";

tabler(); // tabler:home, tabler:user, ...
tabler({ variant: "filled", prefix: "filled" }); // filled:heart, ...
```

The default variant is `"outline"`.

### Your SVG files

```ts
import { local } from "znaki/vite";

local({ dir: "src/icons" });
// src/icons/logo.svg       → local:logo
// src/icons/brand/mark.svg → local:brand/mark

local({ dir: "src/icons", prefix: "app" });
// src/icons/logo.svg → app:logo
```

Directories are relative to your Vite root. File changes are picked up during development.

Names normally have the form `<prefix>:<name>`. Set `prefix: ""` for bare names. If two sources provide the same full name, change their prefixes or set `allowOverrides: true` to prefer the first source.

### Custom libraries and parsers

Use `library()` when your icons come from JSON, path data, or another local format. Provide the available names, a loader, and a parser:

```ts
import znaki, { library } from "znaki/vite";

const catalogue: Record<string, { width: number; height: number; path: string }> = {
  home: { width: 24, height: 24, path: "M3 12 12 3 21 12v9H3Z" },
};

const custom = library({
  prefix: "custom",
  list: () => Object.keys(catalogue),
  load: (name) => catalogue[name] ?? null,
  parse: (icon) => ({
    viewBox: `0 0 ${icon.width} ${icon.height}`,
    attrs: { fill: "currentColor" },
    body: `<path d="${icon.path}"/>`,
  }),
});

znaki({ sources: [custom] });
// Use <Icon name="custom:home" /> in your application.
```

- `list()` returns local names, without the prefix.
- `load(name)` returns the raw icon data, or `null` when unavailable.
- `parse(value, name)` returns an SVG string, an object with `body`, `viewBox` and `attrs`, or `null` when unavailable.
- Callbacks must be synchronous. Download remote catalogues before running Vite.
- For a file-backed catalogue, add `dirs: ["icons"]` and an `init(root)` callback that reads it. `init` runs at startup and again when files in those directories change. Relative directories are resolved from the Vite root.

Custom icons have the same name completion and loading options as built-in sources.

## Dynamic icon names

Literal names and simple conditionals work without extra configuration:

```tsx
<Icon name="lucide:heart" />;
<Icon name={expanded ? "lucide:chevron-up" : "lucide:chevron-down"} />;
```

For names supplied through props, arrays, configuration or API responses, declare which icons your application can use:

```ts
znaki({
  sources: [lucide()],
  includeIcons: ["lucide:home", "lucide:arrow-*"],
  lazyIcons: ["lucide:chart-*"],
});
```

- **`includeIcons`** puts matching icons in the main sprite, together with statically discovered icons.
- **`lazyIcons`** puts matching icons in one separate SVG sprite. The browser loads that whole file when a `<use>` first references one of its icons; other icons use the same file. There are no shards, JS icon chunks, or inline-markup renderers.
- An exact name matches only that icon. `*` matches any sequence of characters; `"lucide:*"` selects the whole Lucide catalogue.
- Static delivery wins: literal names, finite conditionals and `includeIcons` stay in the main sprite even when they match `lazyIcons`.
- A dynamic `name` with neither list configured emits one warning per file with its location, naming `includeIcons` or `lazyIcons` to fix delivery. Literal names and finite conditionals never emit this warning.

Type dynamic values as `IconName`:

```tsx
import { Icon } from "znaki";
import type { IconName } from "znaki";

function MenuIcon(props: { name: IconName }) {
  return <Icon name={props.name} size={20} />;
}
```

TypeScript checks names, but does not configure loading: `includeIcons` or `lazyIcons` is still required for this wrapper. Validate names received from external data before using them.

Both paths emit `<svg><use href="…svg#symbol-id" /></svg>` and work without framework-specific loading components. `PreloadSprite` preloads only the main sprite.

## Configuration reference

| Option           | Default        | Purpose                                               |
| ---------------- | -------------- | ----------------------------------------------------- |
| `sources`        | required       | Icon libraries and local directories                  |
| `includeIcons`   | `[]`           | Names or `*` patterns to load together                |
| `lazyIcons`      | `[]`           | Names or `*` patterns to load on demand               |
| `allowOverrides` | `false`        | Prefer the first source when names overlap            |
| `dts`            | `"znaki.d.ts"` | Generated type file path; `false` disables generation |
| `include`        | project root   | Directories to search for icon usage at startup       |
| `exclude`        | `[]`           | Additional directories to skip during that search     |

## Troubleshooting

### TypeScript cannot find `Icon` or rejects a new icon name

Start Vite or run a build to regenerate `znaki.d.ts`. Check that it is included in your TypeScript project. If native SVG attributes lack completion, add the type-only `IconAttributes` augmentation described above.

### An icon cannot be found

Check its source, prefix and spelling. For a dynamic name, check `includeIcons` and `lazyIcons` too. Unknown literal names and missing exact names in those options produce development warnings and fail production builds.

### An SVG file is rejected

Provide a valid `viewBox`, or positive numeric `width` and `height` (plain numbers or `px`). For example:

```svg
<svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M3 12 12 3 21 12v9H3Z" />
</svg>
```

Use presentation attributes such as `fill` and `stroke` instead of `<style>` elements. Event handler attributes, scripts and other active elements, DTD/entity declarations, root-level paint references and SMIL syncbase references are unsupported. Use trusted project files or installed icon packages; znaki is not a sanitizer for user-uploaded SVGs.

## Migrating from 0.x

- Import `Icon` and `PreloadSprite` from `znaki` instead of `znaki/react` or `znaki/solid`.
- Remove `target` and place znaki before your application's JSX plugin.
- Regenerate `znaki.d.ts` and include it in your TypeScript project.
- Replace `dynamic` prefixes with `includeIcons`/`lazyIcons` and explicit `*` patterns.
- Replace `component: "MyIcon"` with `import { Icon as MyIcon } from "znaki"`.
- Add dimensions to SVGs that lack them. Resolve duplicate source names or opt into `allowOverrides`.

## License

[MIT](LICENSE).
