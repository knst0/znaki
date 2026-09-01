---
"znaki": patch
---

fix: make `Icon` name type-safe — declare `IconNameMap` in the package entry so the generated `declare module "znaki"` augmentation merges and `IconName` narrows to the collected icon names instead of `string`
