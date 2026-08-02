---
"@lyse-labs/lyse": patch
---

Two scored rules with demonstrated false positives no longer claim perfect precision. `versioning/changelog-present` reported "No structured CHANGELOG found" on element-plus, whose root holds `CHANGELOG.en-US.md` — it now scans the repo root for `CHANGELOG*` variants instead of matching a fixed list. `tokens/css-custom-property-export` reports that element-plus "exports no CSS custom properties" when `--el-*` is the most consumed CSS variable set in the Vue ecosystem; their names are assembled at Sass compile time, so a text scan structurally cannot see them, and the rule is demoted to experimental until it can. Both had `precisionMeasured: 1` read off the `deterministicValidator` flag, which means "same answer every run", not "cannot be wrong".
