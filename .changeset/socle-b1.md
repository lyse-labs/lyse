---
"@lyse-labs/lyse": minor
---

Two new experimental rules (B1 socle sub-project).

`ai-surface/component-manifest-completeness` — deterministic structural check (Tier B) that each entry in a lyse-style component manifest documents `props` (non-empty), `examples` (non-empty), and — when `variants` is present — that it is not an empty array. Silent when no manifest exists; `ai-surface/component-manifest-json` owns the absence signal. `contributesToScore: false` — no Health Score change.

`components/no-arbitrary-tailwind` — flags non-color arbitrary Tailwind utilities (`p-[12px]`, `text-[14px]`, `w-[37px]`, `gap-[10px]`, `leading-[19px]`, …) where a literal bracket value bypasses the design scale. Color brackets (`bg-[#fff]`, `text-[#111]`) remain owned by `tokens/no-hardcoded-color`. `contributesToScore: false` — no Health Score change. Real-world precision is pending a harvest measurement; the rule ships unmeasured.
