---
"znaki": patch
---

Support Vite 8 (rolldown). Inline icon data is now injected as a local `const __znaki_N` binding in the transformed module instead of an import from the `virtual:znaki/icon/*` module, so the `data` prop binding stays stable under rolldown's renaming. The sprite asset source is now passed directly to `emitFile` instead of `setAssetSource` in `renderStart`.
