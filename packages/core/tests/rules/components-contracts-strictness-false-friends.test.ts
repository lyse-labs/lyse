import { describe, it, expect } from "vitest";
import { ruleFlagged } from "../../validation/audit-probe.js";
import { contractsStrictnessAdapter } from "../../validation/adapters/component-adapters.js";

const PKG = JSON.stringify({ name: "fx", version: "1.0.0" });

// Seed false-friends verified at RED-state — confirm these do not flag.
// Each captures a distinct FP class for the contracts-strictness rule.
const SEEDS: Array<[string, Record<string, string>]> = [
  // 1. Variant prop typed as proper string-literal union — must NOT flag (it's correct)
  [
    "variant-union-correct",
    {
      "package.json": PKG,
      "src/Button.tsx":
        'type V = "primary" | "secondary" | "ghost"; interface P { variant: V; } export const Button = (p: P) => <button>{p.variant}</button>;',
    },
  ],
  // 2. Non-variant string prop (label, title) — must NOT flag ("string" only flags variant-named props)
  [
    "non-variant-string-prop",
    {
      "package.json": PKG,
      "src/Badge.tsx":
        "interface P { label: string; title: string; } export const Badge = (p: P) => <span>{p.label}</span>;",
    },
  ],
  // 3. Private package.json — must NOT flag (private: true guard)
  [
    "private-package-no-types",
    {
      "package.json": JSON.stringify({ name: "private-ui", private: true, main: "./dist/index.js" }),
    },
  ],
  // 4. Non-publishable package.json (no main/module/exports/types) — must NOT flag
  [
    "non-publishable-package",
    {
      "package.json": JSON.stringify({ name: "dev-app", scripts: { test: "vitest" } }),
    },
  ],
  // 5. typed-props via interface reference — proper types, no any/unknown/bare-string-variant
  [
    "typed-props-interface-ref",
    {
      "package.json": PKG,
      "src/Btn.tsx":
        'type P = { label: string }; export const Btn = (p: P) => <button>{p.label}</button>;',
    },
  ],
  // 6. Non-PascalCase export with any param — camelCase functions not scanned as components
  [
    "non-pascalcase-utility",
    {
      "package.json": PKG,
      "src/utils.tsx":
        "interface P { data: any; } export function renderItem(p: P) { return <li>{p.data}</li>; }",
    },
  ],
  // 7. Test file with any-typed props — test files are excluded by path
  [
    "test-file-excluded",
    {
      "package.json": PKG,
      "src/Button.test.tsx":
        "interface P { data: any; } export function Box(p: P) { return <div />; }",
    },
  ],
  // 8. Framework-allowed props typed any — children/ref/key/as/asChild are exempt
  [
    "framework-allowed-any-props",
    {
      "package.json": PKG,
      "src/Slot.tsx":
        "interface P { children: any; ref: any; } export const Slot = (p: P) => <>{p.children}</>;",
    },
  ],
  // 9. Component with no props (untyped) — no TypeAnnotation → skipped
  [
    "no-props-component",
    {
      "package.json": PKG,
      "src/Divider.tsx": "export const Divider = () => <hr />;",
    },
  ],
  // 10. Callback-only props (function types) — not any/unknown/string-variant
  [
    "callback-props-only",
    {
      "package.json": PKG,
      "src/Trigger.tsx":
        "interface P { onClick: () => void; onChange: (val: string) => void; } export const Trigger = (p: P) => <button onClick={p.onClick} />;",
    },
  ],
];

describe("contracts-strictness ignores seed false-friends", () => {
  for (const [name, files] of SEEDS) {
    it(`does not flag: ${name}`, async () => {
      expect(await ruleFlagged(files, "components/contracts-strictness")).toBe(false);
    });
  }
});

describe("contracts-strictness ignores all adapter false-friends", () => {
  const friends = contractsStrictnessAdapter.falseFriends ?? [];
  it("corpus has at least 30 false-friends", () => {
    expect(friends.length).toBeGreaterThanOrEqual(30);
  });

  for (const [idx, files] of friends.entries()) {
    it(`does not flag false-friend #${idx + 1}`, async () => {
      expect(await ruleFlagged(files, "components/contracts-strictness")).toBe(false);
    });
  }
});

describe("contracts-strictness still detects real violations", () => {
  for (const mutation of contractsStrictnessAdapter.mutations) {
    it(`flags mutation: ${mutation.name}`, async () => {
      const files = mutation.apply(contractsStrictnessAdapter.cleanFixture());
      expect(await ruleFlagged(files, "components/contracts-strictness")).toBe(true);
    });
  }
});
