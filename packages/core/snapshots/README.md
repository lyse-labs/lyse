# Codemod snapshot fixtures

Input → expected-patch pairs for each auto-fixable rule. The test runner at
`tests/codemods/snapshots.test.ts` runs the codemod on each `input-*` file
and compares the output to the corresponding `expected-*.patch`.

## Structure

```
snapshots/
├── tokens-no-hardcoded-color/
│   ├── input-<case>.<ext>        # short realistic source snippet
│   └── expected-<case>.patch     # unified diff the codemod must produce
├── tokens-no-hardcoded-spacing/
│   └── ...
└── components-shadow-native/
    └── ...
```

An empty `expected-*.patch` means the codemod is expected to return `patch: null`
(e.g. no token match, no-op case, missing context).

## Updating snapshots

When a codemod's output changes intentionally (e.g. new behavior):

1. Run the codemod manually on the input (see the test runner for invocation).
2. Save the new output to `expected-*.patch`.
3. Run the test suite to confirm the new snapshot passes.
4. Commit the new fixture alongside the codemod change.

## Why not Vitest inline snapshots?

External files make the diff visible in PR reviews — you can see the
old patch vs new patch in plain text without parsing inline strings.

## Token/context assumptions per rule

Each rule's test fixture assumes a specific token map and context. These are
hardcoded in `tests/codemods/snapshots.test.ts` next to the fixture metadata.
When the project's token scale changes, update both the expected patches and
the context in the test runner.

### tokens-no-hardcoded-color

| Fixture             | Colors in map                                                              | Line |
|---------------------|----------------------------------------------------------------------------|------|
| jsx-style           | `#2563eb` → `primary`, `#ffffff` → `white`                                | 6    |
| styled-components   | `#2563eb` → `primary`                                                     | 4    |
| rgba-alpha          | `rgba(0, 0, 0, 0.5)` → `overlay`, `#1f2937` → `neutral-900`              | 2    |
| css                 | `#2563eb` → `primary`, `#1d4ed8` → `primary-dark`, `#ffffff` → `white`   | 2    |
| no-token-match      | `#2563eb` → `primary` (so `#ff0000` is NOT in map)                        | 1    |

### tokens-no-hardcoded-spacing

| Fixture          | Spacing in map                              | Line |
|------------------|---------------------------------------------|------|
| exact-px-match   | `16` → `4`, `8` → `2`                      | 3    |
| rem-match        | `1.5` → `6`, `0.875` → `3.5`              | 2    |
| multiple-match   | `8` → `["2", "sm"]`                        | 1    |
| no-match         | `16` → `4` (so `13` is NOT in map)         | 1    |
| css-file         | `24` → `6`                                  | 2    |

### components-shadow-native

| Fixture                  | componentsModule | Line | Notes                       |
|--------------------------|------------------|------|-----------------------------|
| simple-button            | `@acme/ui`       | 5    | No prior import, injects it |
| with-classname-multiline | `@acme/ui`       | 7    | Button already imported     |
| anchor-to-link           | `@acme/ui`       | 6    | No prior import, injects it |
| input-self-closing       | `@acme/ui`       | 5    | No prior import, injects it |
| no-components-module     | `null`           | 5    | Returns patch:null          |
