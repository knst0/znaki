---
"znaki": patch
---

Fix sprite icons rendering as empty. `<use>` referenced a same-document fragment (`#icon-id`) while the sprite is served as an external file, so no symbol was ever resolved.
