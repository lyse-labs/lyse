# B3 — components/standardized-variant-props — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental/off-score rule `components/standardized-variant-props` that flags a DS component declaring ≥2 mutually-exclusive style-modifier **boolean** props (the "boolean explosion" antipattern) that should be a single `variant` union.

**Architecture:** A self-contained AST scanner mirroring `components/contracts-strictness`'s discovery (exported PascalCase components in `ParsedFiles.ts`, same-file interface/type-alias resolution). For each component, collect boolean props whose names are in a curated style-modifier vocabulary; flag when ≥2. Scans `ParsedFiles` directly (not `componentInventory`) so it works in DS-self repos. No `dsSelfMode` skip.

**Tech Stack:** TypeScript (strict), vitest, `@babel/parser`/`@babel/traverse` (as contracts-strictness uses), `createLyseRule`, the reliability catalogue + autonomous validation engine.

## Global Constraints

- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; ESM `.js` import specifiers.
- Determinism (pure AST over fixed input; no `Date.now()`/`Math.random()`). `lastCalibrated: null`.
- Born `status: "experimental"`, `contributesToScore: false`. NO score change. Catalogue entry: all metrics `null`, `nSamples: 0`, `lastCalibrated: null`, `llmDriven: false`.
- HONEST catalogue: the validation adapter has NO `falseFriends` (so the catalogue-coherence test allows the null entry — the program-wide experimental pattern).
- Zero overlap with `components/contracts-strictness` (which owns variant-as-string-vs-union). B3 owns the boolean-explosion structural antipattern only.
- Do NOT refactor `components-contracts-strictness.ts` (stable/scored) — write a self-contained scanner (small, acceptable duplication of the discovery shape).
- Rule via `createLyseRule`; regenerate `rules-manifest.json` + docs; add sub-axes entry + coverage classification + `BuiltInRuleId` union entry.
- No comments unless WHY is non-obvious. English only.
- Conventional Commits; branch `feat/color-to-90`. Trailers on every commit (blank line before):
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`

## File Structure

- `src/rules/components-standardized-variant-props.ts` — the rule + its scanner (Task 1).
- `src/rules/registry.ts`, `src/reliability/catalogue/sub-axes.ts`, the coverage classification file, `src/types.ts` (`BuiltInRuleId`), `rules-manifest.json` — register (Task 1).
- `validation/adapters/component-adapters.ts` — construction-oracle adapter (Task 1).
- `tests/rules/components-standardized-variant-props.test.ts`, `docs/rules/components-standardized-variant-props.md` (Task 1).
- `CHANGELOG.md`, `.changeset/socle-b3.md` (Task 2).

---

## Task 1: the rule

**Files:**
- Create: `src/rules/components-standardized-variant-props.ts`
- Modify: `src/rules/registry.ts`, `src/reliability/catalogue/sub-axes.ts`, the coverage classification file, `src/types.ts`, `rules-manifest.json`, `validation/adapters/component-adapters.ts`
- Create: `tests/rules/components-standardized-variant-props.test.ts`, `docs/rules/components-standardized-variant-props.md`

**Interfaces:**
- Consumes: `RuleContext`, `ParsedFiles` (`files.ts` = `ParsedTsFile[]` with `.source`), `Finding`, `RuleEvalResult`, `Rule`; `createLyseRule`. `@babel/parser` `parse`, `@babel/traverse` (CJS interop as in `components-contracts-strictness.ts`).
- Produces: rule exported as `rule` with `lyseRuleId: "components/standardized-variant-props"`, axis `components`, severity `warning`. Sub-axis id `components.standardized-variant-props`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/components-standardized-variant-props.test.ts` (mirror the `ParsedFiles` harness in `tests/rules/components-contracts-strictness.test.ts` — read it for the exact way it builds `RuleContext` and `ParsedFiles.ts` entries with `{ path, ast, source, imports }`; if that test exposes a helper to build a parsed file, reuse it):

```typescript
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/components-standardized-variant-props.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const CTX: RuleContext = {
  repoRoot: "/r",
  tokens: null,
  componentsModule: "@acme/ui",
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

// The rule reads only file.source, so ast can be a placeholder.
function tsFiles(...sources: string[]): ParsedFiles {
  return {
    ts: sources.map((source, i) => ({ path: `src/C${i}.tsx`, ast: null, source, imports: [] })),
    css: [],
    cssInJs: [],
  };
}

describe("rule components/standardized-variant-props", () => {
  it("flags a component with two or more style-modifier booleans", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { primary?: boolean; danger?: boolean; ghost?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings.length).toBe(1);
    expect(res.findings[0]!.message).toContain("Button");
  });

  it("does NOT flag a single style-modifier boolean", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { primary?: boolean; disabled?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a proper variant union plus a generic boolean", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { variant?: "primary" | "danger" | "ghost"; disabled?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag generic state booleans", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { disabled?: boolean; loading?: boolean; fullWidth?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT count a style-modifier name that is not boolean", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface BtnProps { primary?: "a" | "b"; danger?: boolean }
export function Button(props: BtnProps) { return <button />; }`
    ));
    expect(res.findings).toHaveLength(0);
  });

  it("counts opportunities as components inspected and reports 0 findings on clean input", async () => {
    const res = await rule.evaluate(CTX, tsFiles(
      `interface CardProps { elevated?: boolean }
export function Card(props: CardProps) { return <div />; }`
    ));
    expect(res.opportunities).toBe(1);
    expect(res.findings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/components-standardized-variant-props.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rule**

Create `src/rules/components-standardized-variant-props.ts`:

```typescript
import { parse as parseBabel } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;

// Mutually-exclusive visual-variant names. A component declaring >=2 of these
// as boolean props has a "boolean explosion" — they should be one `variant`
// union. Allowlist (not denylist): generic state booleans (disabled, loading,
// fullWidth, …) are absent on purpose, so they never match.
const STYLE_MODIFIER_VOCAB = new Set([
  "primary", "secondary", "tertiary", "danger", "destructive", "success",
  "warning", "info", "ghost", "outline", "outlined", "link", "solid",
  "subtle", "plain", "neutral", "accent", "filled", "muted",
]);

function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name);
}

function booleanStyleProps(members: t.TSTypeElement[]): string[] {
  const hits: string[] = [];
  for (const member of members) {
    if (member.type !== "TSPropertySignature") continue;
    const sig = member as t.TSPropertySignature;
    if (sig.key.type !== "Identifier") continue;
    const name = (sig.key as t.Identifier).name;
    if (!STYLE_MODIFIER_VOCAB.has(name.toLowerCase())) continue;
    const ann = sig.typeAnnotation?.typeAnnotation;
    if (!ann || ann.type !== "TSBooleanKeyword") continue;
    hits.push(name);
  }
  return hits;
}

interface VariantFinding {
  componentName: string;
  props: string[];
  line: number;
  column: number;
}

export function scanBooleanVariants(
  source: string,
): { findings: VariantFinding[]; componentCount: number } {
  const findings: VariantFinding[] = [];
  let ast: t.File;
  try {
    ast = parseBabel(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return { findings, componentCount: 0 };
  }

  const typeDeclarations = new Map<string, t.TSTypeElement[]>();
  try {
    traverse(ast, {
      TSInterfaceDeclaration(path) {
        typeDeclarations.set(path.node.id.name, path.node.body.body);
      },
      TSTypeAliasDeclaration(path) {
        const ann = path.node.typeAnnotation;
        if (ann.type === "TSTypeLiteral") {
          typeDeclarations.set(path.node.id.name, (ann as t.TSTypeLiteral).members);
        }
      },
    });
  } catch {
    return { findings, componentCount: 0 };
  }

  let componentCount = 0;

  const resolveAndCollect = (
    componentName: string,
    params: t.Node[],
    loc: { line: number; column: number },
  ): void => {
    if (params.length === 0) return;
    const first = params[0]!;
    let typeAnnotation: t.TSType | undefined;
    if (
      first.type === "Identifier" &&
      (first as t.Identifier).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = ((first as t.Identifier).typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
    } else if (
      first.type === "ObjectPattern" &&
      (first as t.ObjectPattern).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = ((first as t.ObjectPattern).typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
    }
    if (!typeAnnotation) return;

    componentCount++;

    let members: t.TSTypeElement[] | undefined;
    if (typeAnnotation.type === "TSTypeLiteral") {
      members = (typeAnnotation as t.TSTypeLiteral).members;
    } else if (typeAnnotation.type === "TSTypeReference") {
      const ref = typeAnnotation as t.TSTypeReference;
      if (ref.typeName.type === "Identifier") {
        members = typeDeclarations.get((ref.typeName as t.Identifier).name);
      }
    }
    if (!members) return;

    const props = booleanStyleProps(members);
    if (props.length >= 2) {
      findings.push({ componentName, props, line: loc.line, column: loc.column });
    }
  };

  try {
    traverse(ast, {
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (!decl) return;
        if (decl.type === "FunctionDeclaration") {
          const id = decl.id;
          if (id && isPascalCase(id.name)) {
            const loc = decl.loc?.start ?? { line: 1, column: 0 };
            resolveAndCollect(id.name, decl.params, loc);
          }
        } else if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id.type !== "Identifier") continue;
            const name = (d.id as t.Identifier).name;
            if (!isPascalCase(name)) continue;
            const init = d.init;
            const loc = d.loc?.start ?? { line: 1, column: 0 };
            if (init && init.type === "ArrowFunctionExpression") {
              resolveAndCollect(name, (init as t.ArrowFunctionExpression).params, loc);
            } else if (init && init.type === "FunctionExpression") {
              resolveAndCollect(name, (init as t.FunctionExpression).params, loc);
            }
          }
        }
      },
      ExportDefaultDeclaration(path) {
        const decl = path.node.declaration;
        if (decl.type === "FunctionDeclaration") {
          const fn = decl as t.FunctionDeclaration;
          const name = fn.id?.name ?? "default";
          if (isPascalCase(name)) {
            const loc = fn.loc?.start ?? { line: 1, column: 0 };
            resolveAndCollect(name, fn.params, loc);
          }
        }
      },
    });
  } catch {
    return { findings, componentCount };
  }

  return { findings, componentCount };
}

const evaluate = async (
  _ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;
  for (const f of files.ts) {
    if (!/\bexport\b/.test(f.source)) continue;
    const { findings: vf, componentCount } = scanBooleanVariants(f.source);
    opportunities += componentCount;
    for (const v of vf) {
      findings.push({
        ruleId: "components/standardized-variant-props",
        axis: "components",
        severity: "warning",
        location: { file: f.path, line: v.line, column: v.column },
        message: `Component <${v.componentName}> encodes variants as separate boolean props (${v.props.join(", ")}) — use a single \`variant\` union`,
        suggestion: `replace the boolean flags with \`variant?: ${v.props.map((p) => `"${p}"`).join(" | ")}\``,
      });
    }
  }
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: "components/standardized-variant-props",
    defaultSeverity: "warning",
    shortDescription: "Variants encoded as separate boolean props",
    fullDescription:
      "Flags an exported PascalCase component that declares two or more mutually-exclusive visual-variant flags (primary, secondary, danger, ghost, outline, …) as separate `boolean` props — the 'boolean explosion' antipattern. Such props permit nonsensical combinations (`<Button primary danger>`) and give an AI agent no enumerable vocabulary; the standard is a single `variant` string-literal union. Only names in a curated style-modifier vocabulary, typed `boolean`, count — generic state booleans (`disabled`, `loading`, `fullWidth`, …) are never matched. Orthogonal to `components/contracts-strictness`, which checks the type of an existing `variant` prop.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-standardized-variant-props.md",
    rationale: `Why it matters

A component with \`primary\`, \`secondary\`, and \`danger\` boolean props lets a caller set several at once and offers an AI agent no closed set of valid values. One \`variant\` union (\`"primary" | "secondary" | "danger"\`) is mutually exclusive by construction and self-documenting.

A single style boolean (e.g. just \`primary\`) is a common, acceptable shorthand, so the rule fires only at two or more.

Experimental and unmeasured: real-world precision is pending a harvest measurement; the rule does not contribute to the Health Score.`,
    examples: [
      {
        good: `interface ButtonProps { variant?: "primary" | "secondary" | "danger"; disabled?: boolean }`,
        bad: `interface ButtonProps { primary?: boolean; secondary?: boolean; danger?: boolean }`,
      },
    ],
    allowlist: [
      "generic state booleans (disabled, loading, active, selected, fullWidth, rounded, …) — not in the style-modifier vocabulary",
      "a single style-modifier boolean (below the >=2 threshold)",
      "style-modifier names that are not typed `boolean`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
```

- [ ] **Step 4: Run → pass**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/components-standardized-variant-props.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Register the rule**

1. `src/rules/registry.ts`: `import { rule as standardizedVariantProps } from "./components-standardized-variant-props.js";` + add `standardizedVariantProps` to `ruleObjects` (follow the file's existing placement pattern).
2. `src/types.ts`: add `| "components/standardized-variant-props"` to the `BuiltInRuleId` union (next to the other `components/*` ids).
3. `src/reliability/catalogue/sub-axes.ts`: add next to `components.contracts-strictness`:
```typescript
  { id: "components.standardized-variant-props", axis: "components", name: "Standardized variant props (no boolean explosion)", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, nSamples: 0, lastCalibrated: null, contributesToScore: false, ruleIds: ["components/standardized-variant-props"], llmDriven: false },
```
   Then update the top-of-file count comment to the new total.
4. Coverage classification: `grep -rn "components/contracts-strictness" src/reliability/` and add `components/standardized-variant-props` the same way so the completeness gate's `uncovered` stays `[]`.
5. Regenerate the manifest: `grep -n "manifest" package.json`, run the generate script. Do NOT hand-edit `rules-manifest.json`.

- [ ] **Step 6: Add the validation adapter**

In `validation/adapters/component-adapters.ts`, mirror `contractsStrictnessAdapter`'s shape (a `PKG_SIMPLE` package + a `src/*.tsx` component file; no consumer-app or story needed — this rule scans `ParsedFiles` directly). Add:

```typescript
const standardizedVariantPropsAdapter: OracleAdapter = {
  ruleId: "components/standardized-variant-props",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_SIMPLE,
    "src/Button.tsx": [
      'interface ButtonProps { variant?: "primary" | "secondary" | "danger"; disabled?: boolean }',
      "export function Button(props: ButtonProps) { return <button />; }",
    ].join("\n"),
  }),
  mutations: [
    {
      name: "boolean-variant-explosion",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.tsx": [
          "interface ButtonProps { primary?: boolean; secondary?: boolean; danger?: boolean }",
          "export function Button(props: ButtonProps) { return <button />; }",
        ].join("\n"),
      }),
    },
  ],
  metamorphic: [],
};
```

Add `standardizedVariantPropsAdapter` to the `componentAdapters` array. NO `falseFriends`.

- [ ] **Step 7: Verify adapter J=1 + full suite + score unchanged**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm validate:autonomous`
Expected: `ENGINE GATE PASS`, the new `components/standardized-variant-props` adapter at Youden J = 1.000 (clean = TN, mutation = TP). (`PKG_SIMPLE` has no DS dependency, so the rule's `ParsedFiles` scan runs without an inventory — `opportunities` will be ≥1 because Button is an exported component.)

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run`
Expected: full suite green; catalogue parity reflects the new rule; coverage completeness `uncovered = []`; any `scoring-contract` test UNCHANGED (off-score). Confirm a sample audit's finalScore is unchanged.

- [ ] **Step 8: Docs + commit**

Create `docs/rules/components-standardized-variant-props.md` (the `helpUri` target): what it flags, the curated vocabulary, the ≥2 threshold, the boolean-only rule, the zero-overlap boundary vs `contracts-strictness`, and an honest "experimental / unmeasured / off-score" note. Run the docs-generation script if one exists.

```bash
git add src/rules/components-standardized-variant-props.ts src/rules/registry.ts src/types.ts src/reliability/catalogue/sub-axes.ts rules-manifest.json validation/adapters/component-adapters.ts tests/rules/components-standardized-variant-props.test.ts docs/
# also add the coverage classification file you edited in Step 5.4
git commit -m "feat(components): standardized-variant-props rule (boolean-explosion antipattern)"
```
(remember the two trailers)

---

## Task 2: CHANGELOG + changeset

**Files:**
- Modify: `CHANGELOG.md`
- Create: `.changeset/socle-b3.md`

- [ ] **Step 1: CHANGELOG**

Add to `## [Unreleased] / ### Added` (top of the list), one bullet:

> - New experimental socle rule (B3 sub-project): `components/standardized-variant-props` — flags a component that encodes mutually-exclusive visual variants as two or more separate `boolean` props (`primary`/`secondary`/`danger`/…, the "boolean explosion" antipattern) instead of a single `variant` union. Only a curated style-modifier vocabulary typed `boolean` counts (generic state booleans are never matched), and the rule fires only at ≥2. Orthogonal to `components/contracts-strictness` (which types an existing `variant` prop). `experimental` / `contributesToScore: false` — no Health Score change; ships unmeasured (real-world precision pending a harvest measurement).

- [ ] **Step 2: Changeset**

Create `.changeset/socle-b3.md`:

```markdown
---
"@lyse-labs/lyse": minor
---

New experimental socle rule (B3 sub-project) — `components/standardized-variant-props`.

Flags a component that encodes mutually-exclusive visual variants as two or more separate `boolean` props (the "boolean explosion" antipattern: `<Button primary danger>`) instead of a single `variant` string-literal union. Only a curated style-modifier vocabulary (`primary`, `secondary`, `danger`, `ghost`, `outline`, …) typed `boolean` counts — generic state booleans (`disabled`, `loading`, …) are never matched — and the rule fires only at two or more. Orthogonal to `components/contracts-strictness`. `experimental` / `contributesToScore: false` — no Health Score change; ships unmeasured (real-world precision pending a harvest measurement).
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md .changeset/socle-b3.md
git commit -m "docs(changeset): B3 standardized-variant-props rule"
```
(remember the two trailers)

---

## Self-Review

**1. Spec coverage:**
- Boolean-explosion detection (≥2 style-modifier booleans → flag) → Task 1 Steps 1, 3. ✓
- Curated allowlist vocabulary; generic state booleans never matched → `STYLE_MODIFIER_VOCAB` + tests. ✓
- Boolean-typed only → `ann.type === "TSBooleanKeyword"` + the "not boolean" test. ✓
- Scan `ParsedFiles` directly, no inventory, no dsSelfMode skip → `evaluate` over `files.ts`. ✓
- Zero overlap with contracts-strictness → distinct predicate + boundary note in meta/docs. ✓
- Don't refactor contracts-strictness → self-contained scanner. ✓
- Experimental/off-score/null catalogue, no falseFriends → Steps 5–6. ✓
- Full registration + manifest + coverage + BuiltInRuleId + docs → Steps 5, 8. ✓
- CHANGELOG + changeset → Task 2. ✓

**2. Placeholder scan:** No TBD/TODO. "Look up" steps (registry placement, coverage classification file, manifest/docs scripts, the contracts-strictness test harness) are concrete instructions to grep an existing working call site, not vague directives. All code blocks complete.

**3. Type consistency:** `lyseRuleId`/sub-axis id/`ruleIds`/`BuiltInRuleId` all use `components/standardized-variant-props` ↔ `components.standardized-variant-props`. `scanBooleanVariants` returns `{ findings: VariantFinding[]; componentCount: number }`, consumed in `evaluate`. `booleanStyleProps` returns `string[]`, used for the threshold and the message. `rule.evaluate(ctx, files)` call shape matches the contracts-strictness test.

## Risks

- **Adapter `opportunities` = 0.** Unlike the story rules, this rule scans `ParsedFiles` directly, so a single exported component file is enough — `opportunities` ≥ 1 without any inventory/consumer setup. If it somehow reads 0, confirm the fixture file is `.tsx` and the component is `export function Button(props: ButtonProps)` (the discovery requires an exported PascalCase function/arrow with a typed first param).
- **Cross-file prop types** are not resolved (same as contracts-strictness) — a component whose props come from an imported interface won't be analyzed. Acceptable v0.1 limitation; note it in the doc.
- 90% precision is the later measurement campaign; the rule ships experimental.
