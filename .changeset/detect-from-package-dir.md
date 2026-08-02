---
"@lyse-labs/lyse": patch
---

`lyse audit` inside a design system's own package directory now finds its components.

Detection's DS-self branch requires `private: true` **and** a `workspaces` field, both of which live on the monorepo root. Running Lyse from a package directory — `cd packages/ui && lyse audit`, the most ordinary thing a design-system maintainer does — reached that branch with neither, returned `componentsModule: null`, and `buildInventoryForMode` returned `[]`. The component inventory came back **empty on a design system's own source**, and the audit scored a components axis over an inventory that did not exist.

Measured on the golden corpus, where carbon is audited at `packages/react` and polaris at `polaris-react`: both reported `components: 0, extraction degraded` while publishing a components score of 88 and 92. The inventory was seeded from the stories instead, which is why story linkage read "103 of 103" — the two sides were the same list.

Detection now walks up to the nearest workspace root, resolves the family there, and expresses the answer in the audited directory's terms: `value` is the member that owns the directory, and `family[].relDir` is rebased onto the audit root. The walk stops at a `.git` boundary so an audit never adopts an unrelated monorepo above it. It fires only when the audited directory **is** a family member's own root, never when it merely sits underneath one.

Measured: carbon components `0 → 281` (axis 29 → 77, score 78 → 90), polaris `0 → 191` (axis 16 → 90, score 62 → 86).
