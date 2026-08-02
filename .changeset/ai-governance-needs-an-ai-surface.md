---
"@lyse-labs/lyse": patch
---

`ai-governance` no longer scores 100 on repos with no AI. `ai-governance/product-analytics` counted one opportunity per component file unconditionally, while its two sibling rules already returned zero without an AI surface. Because its findings can only fire on AI-marked files, every opportunity on a non-AI repo was clean by construction and the axis published near-perfect adoption — element-plus n=965, mantine n=3138, primer-react n=666. All three rules now agree, and the axis abstains instead.
