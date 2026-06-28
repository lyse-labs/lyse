# `a11y/interactive-role-name`

**Axis:** a11y · **Severity:** warning · **Status:** experimental (off-score, unmeasured)

## What it checks

Every interactive control (`<button>`, `<input>`, `<select>`, `<textarea>`, `<a>`) must have an accessible name — via visible text content, `aria-label`, `aria-labelledby`, or an associated `<label>`.

This rule wraps a single `eslint-plugin-jsx-a11y` rule:

| Sub-rule | What it catches |
|---|---|
| `control-has-associated-label` | Interactive controls with no accessible name (e.g. icon-only buttons, inputs without labels). |

## Boundary with `a11y/essentials`

`a11y/essentials` already wraps `label-has-associated-control` (a `<label>` element that lacks an associated `<input>`). This rule covers the complementary case: an interactive *control* that lacks any accessible name source at all — including icon-only `<button>` elements where there is no label to associate.

Zero overlap: `a11y/essentials` does not enable `control-has-associated-label`.

## Why

Icon-only buttons are the most frequent accessible-name omission in AI-generated UI. A `<button>` containing only an `<svg>` gives screen-reader users no indication of what the control does, violating WCAG 2.1 SC 4.1.2 (Name, Role, Value).

## Bad

```tsx
// Screen readers announce "button" with no name — useless
function CloseButton() {
  return <button><svg /></button>;
}

// No visible text, no aria-label
function SendButton() {
  return <button><span className="icon-send" /></button>;
}
```

## Good

```tsx
function CloseButton() {
  return <button aria-label="Close dialog"><svg aria-hidden="true" /></button>;
}

// Visible text is the best accessible name
function SendButton() {
  return <button>Send</button>;
}

// aria-labelledby works too
function ActionButton({ labelId }: { labelId: string }) {
  return <button aria-labelledby={labelId}><svg aria-hidden="true" /></button>;
}
```

## Status note

This rule is **experimental and unmeasured**. It has no Health Score impact (`contributesToScore: false`). Precision and recall will be measured in a future calibration campaign before any promotion to stable.
