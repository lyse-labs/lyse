---
"@lyse-labs/lyse": patch
---

Fix `lyse manifest` and MCP `get_ds_manifest` returning zero components on a design-system repo while `lyse audit` found them: the manifest path (`graph/build-io.ts`) ignored a configured `designSystem.componentsModule` and never used the `ds-self` inventory strategy for a repo that *is* the design system. Both paths now resolve components through one shared unit (`detection/components-resolution.ts`). Measured on `.bench-corpus/paste`: manifest components 0 → 1109, now matching `lyse audit`. `.bench-corpus/vuetify` and `.bench-corpus/shadcn-svelte` still report 0 — a separate, pre-existing gap where their package names don't match the DS-export detection heuristic, not addressed by this change. `lyse audit` output is unchanged (verified byte-identical before/after, excluding volatile fields).
