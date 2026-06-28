# C3 — Story content quality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two experimental/off-score socle rules — `stories/props-documented` and `stories/usage-examples` — that judge the *content* of Storybook stories a DS component already has, plus a small `argTypes` extension to the story loader they depend on.

**Architecture:** Extend `src/loaders/stories.ts` to record `hasArgTypes` per story entry (Task 1). Two new rules read the already-parsed `StoryIndex` (`byTitle: Map<name, StoryEntry{ componentName?, stories?, hasArgTypes? }>`) and the `componentInventory`, judging only inventory components that *have* a story (absence stays `stories/coverage`'s job → zero overlap). Both born experimental, off-score, catalogue all-null.

**Tech Stack:** TypeScript (strict), vitest, `@babel/parser`/`@babel/traverse` (already used by the loader), `createLyseRule`, the reliability catalogue + autonomous validation engine.

## Global Constraints

- Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; ESM `.js` import specifiers.
- Determinism (pure AST over fixed input; no `Date.now()`/`Math.random()`). `lastCalibrated: null`.
- Both rules born `status: "experimental"`, `contributesToScore: false`. NO score change. Catalogue entries: all metrics `null`, `nSamples: 0`, `lastCalibrated: null`, `llmDriven: false`.
- HONEST catalogue: each validation adapter has NO `falseFriends` (so the catalogue-coherence test allows the entry to stay null — the program-wide pattern for experimental rules).
- Zero overlap with `stories/coverage` (existence), `components/doc-comments` (JSDoc), `ai-surface/component-manifest-completeness` (the manifest). C3 judges only inventory components that HAVE a story.
- Rules via `createLyseRule`; regenerate `rules-manifest.json` + docs; add sub-axes entry + coverage classification per rule.
- No comments unless WHY is non-obvious. English only.
- Conventional Commits; branch `feat/color-to-90`. Trailers on every commit (blank line before):
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01MoiMorjpU4r6NaYfctP96w`

## File Structure

- `src/types.ts` — add optional `hasArgTypes?: boolean` to `StoryEntry` (Task 1).
- `src/loaders/stories.ts` — populate `hasArgTypes` (Task 1).
- `tests/loaders/stories.test.ts` — loader test (Task 1).
- `src/rules/stories-props-documented.ts` — Rule 1 (Task 2).
- `src/rules/stories-usage-examples.ts` — Rule 2 (Task 3).
- `src/rules/registry.ts`, `src/reliability/catalogue/sub-axes.ts`, the coverage classification file, `rules-manifest.json` — register (Tasks 2 & 3).
- `validation/adapters/component-adapters.ts` — add the two construction-oracle adapters + push to `componentAdapters` (Tasks 2 & 3).
- `tests/rules/stories-props-documented.test.ts`, `tests/rules/stories-usage-examples.test.ts` — rule tests (Tasks 2 & 3).
- `docs/rules/stories-props-documented.md`, `docs/rules/stories-usage-examples.md` — docs (Tasks 2 & 3).
- `CHANGELOG.md`, `.changeset/socle-c3.md` (Task 4).

---

## Task 1: Loader `hasArgTypes` extension

**Files:**
- Modify: `src/types.ts` (the `StoryEntry` interface)
- Modify: `src/loaders/stories.ts` (`parseStoryFile` + both `loadStories` entry-build sites)
- Test: `tests/loaders/stories.test.ts`

**Interfaces:**
- Produces: `StoryEntry.hasArgTypes?: boolean` — `true` when the story's default-export meta object literal has an own `argTypes` property; `false` when parsed and absent; may be `undefined` only for entries never parsed (it is always set by `loadStories`). Rules read it as `entry.hasArgTypes === true`.

- [ ] **Step 1: Write the failing test**

Add to `tests/loaders/stories.test.ts` (uses the existing `makeTempDir` / `writeSrcFile` helpers at the top of that file):

```typescript
describe("loadStories — hasArgTypes", () => {
  it("sets hasArgTypes true when the meta declares argTypes", async () => {
    const root = makeTempDir();
    writeSrcFile(
      root,
      "Button.stories.tsx",
      `export default { title: "Button", component: Button, argTypes: { variant: { control: "select" } } };
export const Primary = {};`
    );
    const idx = await loadStories(root);
    expect(idx!.byTitle.get("Button")!.hasArgTypes).toBe(true);
  });

  it("sets hasArgTypes false when the meta has no argTypes", async () => {
    const root = makeTempDir();
    writeSrcFile(
      root,
      "Card.stories.tsx",
      `export default { title: "Card", component: Card };
export const Default = {};`
    );
    const idx = await loadStories(root);
    expect(idx!.byTitle.get("Card")!.hasArgTypes).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/loaders/stories.test.ts`
Expected: FAIL — `hasArgTypes` is `undefined` (property does not exist yet).

- [ ] **Step 3: Add the type field**

In `src/types.ts`, inside `interface StoryEntry`, add after `stories?: StoryExport[];`:

```typescript
  /**
   * True when the story's default-export meta declares an `argTypes` object
   * (the canonical CSF prop-documentation signal). Presence only — the value
   * is not inspected. Always set by `loadStories`; `false` when absent.
   */
  hasArgTypes?: boolean;
```

- [ ] **Step 4: Populate it in the parser**

In `src/loaders/stories.ts`, in `parseStoryFile`:

1. Change the return type and add a local flag. Where it declares `let componentName: string | undefined;`, add below it:
```typescript
  let hasArgTypes = false;
```
2. In the `ExportDefaultDeclaration` handler's `for (const prop of obj.properties)` loop, after the existing `if (keyName === "component") { ... }` block, add:
```typescript
          if (keyName === "argTypes") {
            hasArgTypes = true;
          }
```
3. Update the function's return statement (the `return { ...(componentName !== undefined && { componentName }), stories };`) to:
```typescript
  return {
    ...(componentName !== undefined && { componentName }),
    stories,
    hasArgTypes,
  };
```
4. Update `parseStoryFile`'s declared return type from `{ componentName?: string; stories: StoryExport[] } | undefined` to `{ componentName?: string; stories: StoryExport[]; hasArgTypes: boolean } | undefined`.

In `loadStories`, BOTH entry-build sites (the `storybook-static/index.json` branch and the `fast-glob` fallback branch) currently build `const storyEntry: StoryEntry = { id: ..., importPath };` then, inside `if (parsed) { ... }`, copy `componentName`/`stories`. In each of those `if (parsed) { ... }` blocks, add:
```typescript
            storyEntry.hasArgTypes = parsed.hasArgTypes;
```
(Place it alongside the existing `storyEntry.componentName = ...` / `storyEntry.stories = ...` assignments. Leaving `hasArgTypes` unset when parsing fails is fine — the rules treat `undefined` as not-documented, which is the correct conservative default for an unparseable story.)

- [ ] **Step 5: Run → pass**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/loaders/stories.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/loaders/stories.ts tests/loaders/stories.test.ts
git commit -m "feat(loaders): record hasArgTypes on story entries"
```
(remember the two trailers)

---

## Task 2: `stories/props-documented` rule

**Files:**
- Create: `src/rules/stories-props-documented.ts`
- Modify: `src/rules/registry.ts`, `src/reliability/catalogue/sub-axes.ts`, the coverage classification file, `rules-manifest.json`
- Modify: `validation/adapters/component-adapters.ts`
- Create: `tests/rules/stories-props-documented.test.ts`, `docs/rules/stories-props-documented.md`

**Interfaces:**
- Consumes: `StoryEntry.hasArgTypes` (Task 1); `RuleContext.componentInventory` (`{ name, module, usageCount }[]`), `RuleContext.storyIndex` (`{ byTitle: Map<string, StoryEntry> }`), `RuleContext.dsSelfMode`. `createLyseRule`, `Finding`, `RuleEvalResult`, `ParsedFiles`.
- Produces: rule exported as `rule` with `lyseRuleId: "stories/props-documented"`, axis `stories`, severity `warning`. Sub-axis id `stories.props-documented`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/stories-props-documented.test.ts` (mirrors `tests/rules/storybook-coverage.test.ts`'s harness):

```typescript
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/stories-props-documented.js";
import type { RuleContext, ParsedFiles, StoryIndex, StoryEntry } from "../../src/types.js";

const EMPTY: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function ctxWith(byTitle: Map<string, StoryEntry>, overrides: Partial<RuleContext> = {}): RuleContext {
  const storyIndex: StoryIndex = { byTitle };
  return {
    repoRoot: "/r",
    tokens: null,
    componentsModule: "@acme/ui",
    componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5 }],
    storyIndex,
    excludePaths: [],
    ...overrides,
  };
}

describe("rule stories/props-documented", () => {
  it("does NOT flag a story that declares argTypes", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "src/Button.stories.tsx", hasArgTypes: true }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(1);
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a story whose named export carries args", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "src/Button.stories.tsx", hasArgTypes: false, stories: [{ name: "Primary", args: { variant: "primary" } }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a story with neither argTypes nor any args", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "src/Button.stories.tsx", hasArgTypes: false, stories: [{ name: "Primary" }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(1);
    expect(res.findings.map((f) => f.message).some((m) => m.includes("Button"))).toBe(true);
  });

  it("does not count an inventory component that has no story", async () => {
    const ctx = ctxWith(new Map(), { componentInventory: [{ name: "Ghost", module: "@acme/ui", usageCount: 2 }] });
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(0);
    expect(res.findings).toHaveLength(0);
  });

  it("returns opportunities 0 + no findings when storyIndex is null", async () => {
    const res = await rule.evaluate(ctxWith(new Map(), { storyIndex: null }), EMPTY);
    expect(res.opportunities).toBe(0);
    expect(res.findings).toHaveLength(0);
  });

  it("returns opportunities 0 in dsSelfMode", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", hasArgTypes: false, stories: [{ name: "Primary" }] }]]), { dsSelfMode: true });
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(0);
    expect(res.findings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/stories-props-documented.test.ts`
Expected: FAIL — module `stories-props-documented.js` not found.

- [ ] **Step 3: Implement the rule**

Create `src/rules/stories-props-documented.ts`:

```typescript
import type {
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  StoryEntry,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

function documentsProps(entry: StoryEntry): boolean {
  if (entry.hasArgTypes === true) return true;
  return (entry.stories ?? []).some(
    (s) => s.args !== undefined && Object.keys(s.args).length > 0,
  );
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.dsSelfMode) return { findings, opportunities: 0 };
  if (!ctx.storyIndex) return { findings, opportunities: 0 };

  let opportunities = 0;
  for (const c of ctx.componentInventory) {
    const entry = ctx.storyIndex.byTitle.get(c.name);
    if (!entry) continue;
    opportunities++;
    if (!documentsProps(entry)) {
      findings.push({
        ruleId: "stories/props-documented",
        axis: "stories",
        severity: "warning",
        location: { file: "(inventory)", line: 0, column: 0 },
        message: `DS component <${c.name}> has a story that documents no props (no argTypes and no args)`,
        suggestion: `add an \`argTypes\` block or arg'd story exports to ${c.name}'s story`,
      });
    }
  }
  return { findings, opportunities };
};

export const rule = createLyseRule({
  meta: {
    axis: "stories",
    lyseRuleId: "stories/props-documented",
    defaultSeverity: "warning",
    shortDescription: "Stories that document no component props",
    fullDescription:
      "A DS component that HAS a Storybook story but whose story documents no props — neither an `argTypes` block in the default-export meta nor any named story carrying `args` — is flagged. Such a story renders the component but teaches a consumer (human or AI agent) nothing about its API. Only components present in the inventory AND with a story are judged; absence of a story is owned by `stories/coverage`.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/stories-props-documented.md",
    rationale: `Why it matters

The story is the canonical example surface for a DS component. A story that exercises no props documents nothing an integrator can act on. \`argTypes\` (explicit controls/docs) OR concrete \`args\` on a named story both satisfy the rule — autodocs users who set args are not penalized.

Experimental and unmeasured: real-world precision is pending a harvest measurement; the rule does not contribute to the Health Score.`,
    examples: [
      {
        good: "export default { component: Button, argTypes: { variant: {...} } }",
        bad: "export default { component: Button }; export const Primary = {};",
      },
    ],
    allowlist: [
      "components not in `componentInventory`",
      "inventory components with no story (owned by `stories/coverage`)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
```

- [ ] **Step 4: Run → pass**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/stories-props-documented.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Register the rule**

1. `src/rules/registry.ts`: add `import { rule as storiesPropsDocumented } from "./stories-props-documented.js";` alongside the other rule imports, and add `storiesPropsDocumented` to the `ruleObjects` array (follow the exact pattern the file already uses — including alphabetic/grouped placement if there is one).
2. `src/reliability/catalogue/sub-axes.ts`: add this entry next to `stories.coverage` (copy the C2 experimental shape verbatim, changing ids/name):
```typescript
  { id: "stories.props-documented", axis: "stories", name: "Story documents component props", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, nSamples: 0, lastCalibrated: null, contributesToScore: false, ruleIds: ["stories/props-documented"], llmDriven: false },
```
   Then update the top-of-file count comment (`// N sub-axes, 1:1 mapped to the N shipped rules.`) to the new total.
3. Coverage classification: grep for where `stories/coverage` is classified (`grep -rn "stories/coverage" src/reliability/`) and add `stories/props-documented` the same way, so the completeness gate's `uncovered` stays `[]`.
4. Regenerate the manifest: find the script (`grep -n "manifest" package.json`) and run it (e.g. `pnpm run <generate-manifest-script>`). Do NOT hand-edit `rules-manifest.json`.

- [ ] **Step 6: Add the validation adapter**

In `validation/adapters/component-adapters.ts`, reuse the existing consumer-app + story pattern (`PKG_CONSUMER`, and a `src/App.tsx` that imports the components from `@acme/ui` so they enter the inventory). Add:

```typescript
// stories/props-documented: clean = both components' stories document props
// (argTypes or args); mutation = Button's story documents nothing. Two
// components keep storyIndex non-null even when Button is the violation.
const PROPS_DOC_APP_TSX = [
  'import { Button, Card } from "@acme/ui";',
  "export function App() {",
  "  return <div><Button>click</Button><Card /></div>;",
  "}",
].join("\n");

const propsDocumentedAdapter: OracleAdapter = {
  ruleId: "stories/props-documented",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_CONSUMER,
    "src/App.tsx": PROPS_DOC_APP_TSX,
    "src/Button.stories.tsx": [
      'import { Button } from "@acme/ui";',
      'export default { title: "Button", component: Button, argTypes: { variant: { control: "select" } } };',
      "export const Primary = {};",
    ].join("\n"),
    "src/Card.stories.tsx": [
      'import { Card } from "@acme/ui";',
      'export default { title: "Card", component: Card };',
      'export const Default = { args: { elevated: true } };',
    ].join("\n"),
  }),
  mutations: [
    {
      name: "button-story-documents-no-props",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.stories.tsx": [
          'import { Button } from "@acme/ui";',
          'export default { title: "Button", component: Button };',
          "export const Primary = {};",
        ].join("\n"),
      }),
    },
  ],
  metamorphic: [],
};
```

Add `propsDocumentedAdapter` to the `componentAdapters` array at the end of the file.

- [ ] **Step 7: Verify the adapter at J=1 + full suite + score unchanged**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm validate:autonomous`
Expected: `ENGINE GATE PASS`, the new `stories/props-documented` adapter reported at Youden J = 1.000 (clean = TN, mutation = TP), no regressions. (If `opportunities` comes back 0 — i.e. the component never entered the inventory — adjust the fixture so `@acme/ui` is auto-detected as the components module and Button/Card are imported AND used in `App.tsx`; confirm against how `storiesCoverageAdapter` in the same file does it.)

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run`
Expected: full suite green; the catalogue parity test reflects the new rule; the coverage completeness test shows `uncovered = []`; any `scoring-contract` test is UNCHANGED (the rule is off-score). Confirm a sample audit's finalScore is unchanged.

- [ ] **Step 8: Docs + commit**

Create `docs/rules/stories-props-documented.md` (the `helpUri` target): describe what it flags, the argTypes-OR-args definition, the zero-overlap boundary vs `stories/coverage` and the manifest rule, and an honest "experimental / unmeasured / off-score" note. If a docs-generation script exists (`grep -n "docs" package.json`), run it.

```bash
git add src/rules/stories-props-documented.ts src/rules/registry.ts src/reliability/catalogue/sub-axes.ts rules-manifest.json validation/adapters/component-adapters.ts tests/rules/stories-props-documented.test.ts docs/
# also add the coverage classification file you edited in Step 5.3
git commit -m "feat(stories): props-documented rule (story documents component props)"
```
(remember the two trailers)

---

## Task 3: `stories/usage-examples` rule

**Files:**
- Create: `src/rules/stories-usage-examples.ts`
- Modify: `src/rules/registry.ts`, `src/reliability/catalogue/sub-axes.ts`, the coverage classification file, `rules-manifest.json`
- Modify: `validation/adapters/component-adapters.ts`
- Create: `tests/rules/stories-usage-examples.test.ts`, `docs/rules/stories-usage-examples.md`

**Interfaces:**
- Consumes: `StoryEntry.stories` (`StoryExport[]` with optional `args`), the same `RuleContext` fields as Task 2.
- Produces: rule exported as `rule` with `lyseRuleId: "stories/usage-examples"`, axis `stories`, severity `warning`. Sub-axis id `stories.usage-examples`.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/stories-usage-examples.test.ts` (same `ctxWith` harness as Task 2):

```typescript
import { describe, it, expect } from "vitest";
import { rule } from "../../src/rules/stories-usage-examples.js";
import type { RuleContext, ParsedFiles, StoryIndex, StoryEntry } from "../../src/types.js";

const EMPTY: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function ctxWith(byTitle: Map<string, StoryEntry>, overrides: Partial<RuleContext> = {}): RuleContext {
  const storyIndex: StoryIndex = { byTitle };
  return {
    repoRoot: "/r",
    tokens: null,
    componentsModule: "@acme/ui",
    componentInventory: [{ name: "Button", module: "@acme/ui", usageCount: 5 }],
    storyIndex,
    excludePaths: [],
    ...overrides,
  };
}

describe("rule stories/usage-examples", () => {
  it("does NOT flag a story with two or more named exports", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary" }, { name: "Secondary" }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(1);
    expect(res.findings).toHaveLength(0);
  });

  it("does NOT flag a single export that carries args", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary", args: { variant: "primary" } }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(0);
  });

  it("flags a single bare export with no args", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary" }] }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings.map((f) => f.message).some((m) => m.includes("Button"))).toBe(true);
  });

  it("flags a story with zero named exports", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x" }]]));
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.findings).toHaveLength(1);
  });

  it("returns opportunities 0 when storyIndex is null", async () => {
    const res = await rule.evaluate(ctxWith(new Map(), { storyIndex: null }), EMPTY);
    expect(res.opportunities).toBe(0);
    expect(res.findings).toHaveLength(0);
  });

  it("returns opportunities 0 in dsSelfMode", async () => {
    const ctx = ctxWith(new Map([["Button", { id: "b", importPath: "x", stories: [{ name: "Primary" }] }]]), { dsSelfMode: true });
    const res = await rule.evaluate(ctx, EMPTY);
    expect(res.opportunities).toBe(0);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/stories-usage-examples.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the rule**

Create `src/rules/stories-usage-examples.ts`:

```typescript
import type {
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  StoryEntry,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

function hasUsageExamples(entry: StoryEntry): boolean {
  const stories = entry.stories ?? [];
  if (stories.length >= 2) return true;
  return stories.some(
    (s) => s.args !== undefined && Object.keys(s.args).length > 0,
  );
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.dsSelfMode) return { findings, opportunities: 0 };
  if (!ctx.storyIndex) return { findings, opportunities: 0 };

  let opportunities = 0;
  for (const c of ctx.componentInventory) {
    const entry = ctx.storyIndex.byTitle.get(c.name);
    if (!entry) continue;
    opportunities++;
    if (!hasUsageExamples(entry)) {
      findings.push({
        ruleId: "stories/usage-examples",
        axis: "stories",
        severity: "warning",
        location: { file: "(inventory)", line: 0, column: 0 },
        message: `DS component <${c.name}> has a story but shows no usage examples (a single undifferentiated render)`,
        suggestion: `add named story exports demonstrating ${c.name}'s variants/states`,
      });
    }
  }
  return { findings, opportunities };
};

export const rule = createLyseRule({
  meta: {
    axis: "stories",
    lyseRuleId: "stories/usage-examples",
    defaultSeverity: "warning",
    shortDescription: "Stories that show no usage examples",
    fullDescription:
      "A DS component that HAS a Storybook story but whose story shows essentially nothing — fewer than two named story exports AND no export carrying concrete `args` — is flagged. A single undifferentiated render is not a usage example. Only components present in the inventory AND with a story are judged; absence of a story is owned by `stories/coverage`.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/stories-usage-examples.md",
    rationale: `Why it matters

A consumer (human or AI agent) learns how to use a component from its story examples. A story with a single bare render demonstrates no configuration or variant. Two or more named exports, OR at least one export with concrete \`args\`, counts as showing usage.

Experimental and unmeasured: real-world precision is pending a harvest measurement; the rule does not contribute to the Health Score.`,
    examples: [
      {
        good: "export const Primary = {...}; export const Disabled = {...};",
        bad: "export const Primary = {};",
      },
    ],
    allowlist: [
      "components not in `componentInventory`",
      "inventory components with no story (owned by `stories/coverage`)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
```

- [ ] **Step 4: Run → pass**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/stories-usage-examples.test.ts`
Expected: PASS (all six cases).

- [ ] **Step 5: Register the rule**

Same four edits as Task 2 Step 5, for `stories/usage-examples`:
1. `registry.ts`: `import { rule as storiesUsageExamples } from "./stories-usage-examples.js";` + add to `ruleObjects`.
2. `sub-axes.ts`: add next to `stories.props-documented`:
```typescript
  { id: "stories.usage-examples", axis: "stories", name: "Story shows usage examples", status: "experimental", precisionMeasured: null, recallMeasured: null, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, nSamples: 0, lastCalibrated: null, contributesToScore: false, ruleIds: ["stories/usage-examples"], llmDriven: false },
```
   Update the top-of-file count comment to the new total.
3. Coverage classification: add `stories/usage-examples` the same way as `stories/coverage`.
4. Regenerate `rules-manifest.json` via the generate script (no hand-edit).

- [ ] **Step 6: Add the validation adapter**

In `validation/adapters/component-adapters.ts`, add:

```typescript
// stories/usage-examples: clean = both components have multiple named story
// exports; mutation = Button's story has a single bare export (no args). Card
// keeps multiple exports so storyIndex stays non-null.
const usageExamplesAdapter: OracleAdapter = {
  ruleId: "stories/usage-examples",
  oracleKind: "construction",
  cleanFixture: () => ({
    "package.json": PKG_CONSUMER,
    "src/App.tsx": PROPS_DOC_APP_TSX,
    "src/Button.stories.tsx": [
      'import { Button } from "@acme/ui";',
      'export default { title: "Button", component: Button };',
      "export const Primary = {};",
      "export const Secondary = {};",
    ].join("\n"),
    "src/Card.stories.tsx": [
      'import { Card } from "@acme/ui";',
      'export default { title: "Card", component: Card };',
      "export const Default = {};",
      "export const Elevated = {};",
    ].join("\n"),
  }),
  mutations: [
    {
      name: "button-story-single-bare-export",
      apply: (f): FixtureFiles => ({
        ...f,
        "src/Button.stories.tsx": [
          'import { Button } from "@acme/ui";',
          'export default { title: "Button", component: Button };',
          "export const Primary = {};",
        ].join("\n"),
      }),
    },
  ],
  metamorphic: [],
};
```

(`PROPS_DOC_APP_TSX` is defined in Task 2 Step 6; reuse it.) Add `usageExamplesAdapter` to the `componentAdapters` array.

- [ ] **Step 7: Verify J=1 + full suite + score unchanged**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm validate:autonomous` → `ENGINE GATE PASS`, `stories/usage-examples` at J = 1.000. (Same inventory caveat as Task 2 Step 7 if `opportunities` is 0.)
Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run` → full suite green, parity reflects the rule, `uncovered = []`, scoring-contract unchanged.

- [ ] **Step 8: Docs + commit**

Create `docs/rules/stories-usage-examples.md` (helpUri target): what it flags, the `≥2 exports OR ≥1 arg'd export` definition, the zero-overlap boundary, honest experimental note. Run the docs-generation script if one exists.

```bash
git add src/rules/stories-usage-examples.ts src/rules/registry.ts src/reliability/catalogue/sub-axes.ts rules-manifest.json validation/adapters/component-adapters.ts tests/rules/stories-usage-examples.test.ts docs/
# also add the coverage classification file you edited in Step 5.3
git commit -m "feat(stories): usage-examples rule (story shows usage examples)"
```
(remember the two trailers)

---

## Task 4: CHANGELOG + changeset

**Files:**
- Modify: `CHANGELOG.md`
- Create: `.changeset/socle-c3.md`

- [ ] **Step 1: CHANGELOG**

Add to the `## [Unreleased] / ### Added` section (top of the list, above the C2 entry), one bullet:

> - Two new experimental socle rules (C3 sub-project) that judge Storybook story *content* (only for components that already have a story — `stories/coverage` owns absence): `stories/props-documented` flags a story that documents no props (neither an `argTypes` block nor any named story carrying `args`); `stories/usage-examples` flags a story that shows no usage examples (fewer than two named exports and no arg'd export). Both `experimental` / `contributesToScore: false` — no Health Score change; ship unmeasured (real-world precision pending a harvest measurement). The story loader now records `hasArgTypes` per story entry.

- [ ] **Step 2: Changeset**

Create `.changeset/socle-c3.md`:

```markdown
---
"@lyse-labs/lyse": minor
---

Two new experimental socle rules (C3 sub-project) — `stories/props-documented` and `stories/usage-examples`.

Both judge the content of a Storybook story a DS component already has (absence of a story stays `stories/coverage`'s job). `stories/props-documented` flags a story that documents no props — neither an `argTypes` block nor any named story carrying `args`. `stories/usage-examples` flags a story showing no usage examples — fewer than two named exports and no arg'd export. Both `experimental` / `contributesToScore: false` — no Health Score change; ship unmeasured (real-world precision pending a harvest measurement). The story loader now records `hasArgTypes` per story entry.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md .changeset/socle-c3.md
git commit -m "docs(changeset): C3 story content quality rules"
```
(remember the two trailers)

---

## Self-Review

**1. Spec coverage:**
- Loader `hasArgTypes` extension → Task 1. ✓
- `stories/props-documented` (argTypes OR non-empty args; opportunities = inventory ∩ has-story; dsSelfMode/null guards) → Task 2 Steps 1, 3. ✓
- `stories/usage-examples` (`≥2 exports OR ≥1 arg'd`; same guards) → Task 3 Steps 1, 3. ✓
- Zero overlap with coverage (judges only components that have a story) → both rules skip `!entry`. ✓
- Experimental/off-score/null catalogue, no falseFriends → Tasks 2 & 3 Steps 5–6. ✓
- Full registration + manifest + coverage + docs → Tasks 2 & 3 Steps 5, 8. ✓
- CHANGELOG + changeset → Task 4. ✓

**2. Placeholder scan:** No TBD/TODO. The only "look it up" steps are (a) the registry placement pattern, (b) the coverage classification file location, and (c) the manifest/docs generation script names — each is a concrete instruction to grep an existing, working call site (`stories/coverage`), not a vague directive. All code blocks are complete.

**3. Type consistency:** `StoryEntry.hasArgTypes?: boolean` defined in Task 1, read as `entry.hasArgTypes === true` in Task 2. `documentsProps`/`hasUsageExamples` consistent with the `StoryExport.args` shape (`Record<string,...>`, checked non-empty via `Object.keys(...).length > 0`). `rule.evaluate(ctx, files)` call shape matches `storybook-coverage.test.ts`. Sub-axis ids (`stories.props-documented`, `stories.usage-examples`) ↔ rule ids (`stories/props-documented`, `stories/usage-examples`) consistent across tasks.

## Risks

- **Inventory population in adapters (the main risk).** The construction-oracle adapters run the real `auditDirectory`, which builds `componentInventory` only when a `componentsModule` is detected and its components are imported AND used. The fixtures mirror the existing `storiesCoverageAdapter` (`PKG_CONSUMER` with `@acme/ui` in deps + `App.tsx` importing/using Button & Card). If `opportunities` returns 0, the component never entered the inventory — fix the fixture (not the rule) per Task 2/3 Step 7.
- **Two components per fixture.** Like `storiesCoverageAdapter`, each adapter keeps a second documented component (Card) so `storyIndex` stays non-null when the mutation degrades Button — otherwise the rule would read N/A instead of firing.
- 90% precision is the later measurement campaign; both rules ship experimental.
