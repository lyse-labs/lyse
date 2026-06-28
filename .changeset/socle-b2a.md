---
"@lyse-labs/lyse": minor
---

New experimental socle rule (B2a sub-project).

`components/no-style-escape-hatch` — flags an inline `style={...}` prop on a design-system component (a JSX tag imported from the configured `componentsModule`, or present in the component inventory) as a value-agnostic bypass of the component's prop API. Raw HTML, non-DS components, DS components without a `style` prop, and DS-self audits (`dsSelfMode`) are not flagged. It owns only the `style`-prop presence — `className` arbitrary values stay with `components/no-arbitrary-tailwind`, hardcoded values stay with their token rules. `contributesToScore: false` — no Health Score change; ships unmeasured (real-world precision pending a harvest measurement). Adds a reusable `isDsComponent` resolver (substrate for the upcoming `prefer-existing-component`).
