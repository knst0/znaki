# znaki

Typesafe SVG icons for Vite. Collects the icons you actually use at build time, ships them as
an external sprite, and generates a union type of every available icon name.

## Install

```sh
pnpm add -D znaki @tabler/icons
```

`solid-js`, `@solidjs/web`, `react` and `@tabler/icons` are optional peer dependencies — install
only what you use.

## Setup

```ts
import znaki, { local, tabler } from "znaki/vite";

export default defineConfig({
  plugins: [
    znaki({
      sources: [tabler(), local({ dir: "src/icons" })],
    }),
  ],
});
```

Add the generated declaration file and the virtual module types to your `tsconfig.json`:

```json
{
  "compilerOptions": { "types": ["znaki/client"] },
  "include": ["src", "znaki.d.ts"]
}
```

## Usage

Import the components from the entry point for your framework — `znaki/solid` or `znaki/react`.
Both expose the same API.

```tsx
import { Icon, PreloadSprite } from "znaki/solid";

<PreloadSprite />;
<Icon name="tabler:home" size={24} />;
<Icon name="local:logo" class="brand" />;
```

```tsx
import { Icon, PreloadSprite } from "znaki/react";

<PreloadSprite />;
<Icon name="tabler:home" size={24} />;
<Icon name="local:logo" className="brand" />;
```

Icon names are `<prefix>:<name>`. Pass `prefix: ""` to a source to use bare names.

## Sources

| Source                           | Names                         |
| -------------------------------- | ----------------------------- |
| `tabler({ variant: "outline" })` | `tabler:home`                 |
| `local({ dir: "src/icons" })`    | `local:logo`, `local:brand/x` |

Sources are resolved in order, so an earlier source wins on a name collision. A custom source is
just an object implementing `IconSource`.

## Delivery

Icons become `<symbol>`s in a single hashed `znaki-sprite.svg` asset, referenced with
`<use href="/assets/znaki-sprite-<hash>.svg#znaki-tabler-home">`. One cacheable request for the
whole set.

Names that cannot be resolved statically — say a wrapper component that forwards
`<Icon name={props.icon} />` — are still served from the sprite: once such a usage exists, every
string literal in the scanned files that is a known icon name (`<Button icon="tabler:home" />`,
`const ICON = "tabler:user"`) is added to the sprite as well.

Only names built at runtime fall back to a lazily imported registry, at the cost of a dynamic
import. A template literal with a static head (`` `tabler:arrow-${dir}` ``) makes every icon starting
with that head reachable. Names from anywhere else (an API response, `"tabler:" + name`) need the
`dynamic` option — an allowlist of names or name prefixes:

```ts
znaki({ sources: [tabler()], dynamic: ["tabler:arrow-", "tabler:home"] });
```

The registry is split into shards grouped by source prefix and the first two characters of the
name, so one lookup pulls in a small chunk instead of a chunk per icon. Icons already in the
sprite never end up in the registry.

## Options

| Option      | Default        | Description                                      |
| ----------- | -------------- | ------------------------------------------------ |
| `sources`   | —              | Icon sources, resolved in order                  |
| `component` | `"Icon"`       | JSX tag name the scanner looks for               |
| `dynamic`   | `[]`           | Names or prefixes reachable through the registry |
| `dts`       | `"znaki.d.ts"` | Where to write the generated names, or `false`   |
| `include`   | project root   | Directories to scan for icon usage               |
| `exclude`   | —              | Extra directories to skip while scanning         |

Scanning always skips `node_modules`, dot directories, `build.outDir` and the usual output
directories (`dist`, `build`, `coverage`, `storybook-static`).

## License

This project is licensed under the terms of the [MIT License](/LICENSE).
