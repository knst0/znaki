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

Names that cannot be resolved statically (a variable that is not a compile-time constant) fall
back to a lazily imported registry, so they still work at the cost of a dynamic import.

## Options

| Option      | Default        | Description                                    |
| ----------- | -------------- | ---------------------------------------------- |
| `sources`   | —              | Icon sources, resolved in order                |
| `component` | `"Icon"`       | JSX tag name the scanner looks for             |
| `dts`       | `"znaki.d.ts"` | Where to write the generated names, or `false` |
| `include`   | project root   | Directories to scan for icon usage             |

## License

This project is licensed under the terms of the [MIT License](/LICENSE).
