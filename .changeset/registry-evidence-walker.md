---
"@lyse-labs/lyse": patch
---

A design system that ships from its own documentation site is no longer invisible.

`lyse audit` scanned **zero** of magicuidesign/magicui's 955 files. All 373 of its walker-recognised source files sit under `apps/www`, which `DEFAULT_EXCLUDE_PATHS` skips as a documentation site — but `apps/www/registry/` is what the project publishes, and `apps/www/registry.json` declares all 244 files of it.

A `registry.json` whose `items[].files[].path` entries resolve **relative to the directory holding it** now overrides that exclusion, for exactly the directories it names. Resolution is the whole test, and it is what makes the signal usable: magicui's tree holds four `registry.json` files and only one resolves — the built copies under `public/` and the aggregate at the repo root are written against a different base and resolve 0 of 244 and 0 of 211, so they are ignored with no rule about where a registry may sit. `.gitignore`, the hardcoded `node_modules`/`dist` ignores and your own `excludePaths` all still outrank it: a registry is inference, and inference does not beat a file you excluded on purpose.

Measured before designing the fix, across the 58 checkouts available locally. Seven repositories use an `apps/` doc-site layout and twelve such directories exist; **one publishes from inside it.** All twelve are `private: true` with no entry point, so package metadata cannot tell them apart — the resolving `registry.json` is the only signal measured to separate the one from the other eleven. Scoped to the four `apps/` patterns rather than all of `DEFAULT_EXCLUDE_PATHS` for the same reason it exists: widening admits the identical 244 files on the identical single repository and costs 12.8s instead of 71ms, because the recursive docs and fixtures patterns force a deep directory walk on every audit.

Measured on both corpora, per [#269](https://github.com/lyse-labs/lyse/issues/269). Calibration (`measure:ds-detection`, `measure:ds-precision`): byte-for-byte identical, 21 of 26 detected and 2 false positives of 4, unchanged. Held out (`measure:heldout`): one repository moves. magicui goes from 0 files scanned to 244, and from no publishable score to 96 — a11y `N/A → 100` (40 opportunities), components `N/A → 88` (59). `bench-golden` and `generalization` are unchanged on all 10 pinned repositories.

**This fixes reach, not identity.** magicui's component inventory is still empty, because `identifyDsFamily` separately disqualifies its only workspace package with `app-or-site-directory` despite 335 component-shaped files in it. That is the `APP_OR_SITE_DIR_SEGMENTS` disqualifier [#265](https://github.com/lyse-labs/lyse/pull/265) measured as costing three regressions for one repository fixed, so it is left alone and filed rather than widened here.
