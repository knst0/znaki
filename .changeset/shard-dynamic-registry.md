---
---

Split the lazy registry into shards grouped by source prefix and name, instead of emitting a chunk per icon, and add a `dynamic` allowlist option to limit which names the registry covers. `virtual:znaki/registry` now exports `shards` instead of `registry`.
