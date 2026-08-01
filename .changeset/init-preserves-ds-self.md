---
"@lyse-labs/lyse": patch
---

`lyse init` no longer breaks the audit it just configured. A `designSystem.componentsModule` in `.lyse.yaml` was read as evidence that the repo merely consumes that module, discarding the `dsSelf` flag and the DS family detection had established — so a design system auditing itself lost its entire component inventory (element-plus: 98 components before `init`, 0 after). A configured module that names the detected design system, or any member of its family, now keeps ds-self mode.
