---
"znaki": minor
---

Stop shipping the whole icon set when a dynamic `<Icon name={...}>` is found. Icon names written as string literals anywhere in the scanned files now go into the sprite, the registry only covers template-literal heads and the `dynamic` allowlist (now `[]` by default), sprite icons are left out of it, and the build warning about dynamic usage is gone. Pass `dynamic: [""]` to get the old behaviour back.
