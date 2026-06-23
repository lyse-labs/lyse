# Runtime a11y via Storybook + axe-core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run `axe-core` accessibility checks against a design system's real rendered components (sourced from an already-built Storybook) under the opt-in `lyse audit --render`, surfacing runtime a11y violations static analysis cannot see.

**Architecture:** A new rule `a11y/runtime-axe` consumes axe violations collected per-story. Two new render-layer units — `render/storybook-source.ts` (locate a pre-built Storybook, enumerate stories) and `render/axe-runner.ts` (inject axe-core into a page, run it, map results) — feed the audit pipeline's opt-in render stage, which threads violations onto `RuleContext`. An execution-oracle adapter validates the inject→run→map→finding wiring (Youden's J = 1) without needing a full Storybook build.

**Tech Stack:** TypeScript (Node ESM), Playwright (optional peerDependency, already present), axe-core (new pinned dependency), Vitest.

## Global Constraints

- Strict TypeScript: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. All relative imports end in `.js`.
- Default `lyse audit` is UNCHANGED: zero-config, offline, no browser. Runtime-axe runs only under `--render`.
- Lyse CONSUMES a pre-built Storybook (`storybook-static/` directory or a running URL). It NEVER runs the repo's build toolchain.
- N/A when no Storybook is found/provided: the rule returns `{ findings: [], opportunities: 0 }`. A build/render failure yields N/A, never a false pass.
- `axe-core` is pinned: add `"axe-core": "4.10.2"` to `dependencies`. Report the actual injected version via `axe.version` in `meta.render.axeVersion`.
- Playwright stays an optional peerDependency. Absent Playwright/Chromium → `RenderUnavailableError` → clean skip (existing render-layer degrade path).
- Deterministic output: no timestamps in render findings; story lists and violation lists sorted by id. Same DOM + same pinned axe-core → identical findings.
- The rule is experimental, `contributesToScore: false` (opt-in/render-only, N/A in default audit). Truth-grade of its findings is MEASURED (execution oracle).
- Registering a registry rule REQUIRES three coordinated edits or the suite fails: (1) `rules/registry.ts` entry, (2) a matching `SUB_AXES` catalogue entry — `SUB_AXES.length` must equal `ruleObjects.length`, (3) a `validation/coverage.ts` classification so `coverageGaps().uncovered` stays empty.
- `No comments` unless WHY is non-obvious. All artifacts in English.
- Severity mapping (axe impact → Lyse severity): `critical`/`serious` → `error`; `moderate`/`minor`/null → `warning`.

---

### Task 1: axe-runner — inject axe-core into a page and map results

**Files:**
- Create: `packages/core/src/render/axe-runner.ts`
- Test: `packages/core/tests/render/axe-runner.test.ts`
- Modify: `packages/core/package.json` (add `axe-core` to `dependencies`)

**Interfaces:**
- Consumes: `withChromium` from `packages/core/src/render/browser.js`; `RenderUnavailableError` from `packages/core/src/render/types.js`.
- Produces:
  - `interface AxeViolation { ruleId: string; impact: string; nodes: number; help: string }`
  - `injectAndRunAxe(page: Page, runOptions?: Record<string, unknown>): Promise<AxeViolation[]>`
  - `runAxeOnStory(page: Page, storyUrl: string, runOptions?: Record<string, unknown>): Promise<AxeViolation[]>`
  - `axeVersion(): string`

- [ ] **Step 1: Add the axe-core dependency**

Edit `packages/core/package.json`. In the `dependencies` block (alphabetical), add the pinned axe-core entry. For example, if `dependencies` currently contains `"ajv": "^8.20.0"` near the top, insert before it:

```json
    "axe-core": "4.10.2",
```

Then install:

```bash
cd /Users/noechague/dev/lyse && pnpm install
```

Expected: lockfile updates, `axe-core@4.10.2` resolved.

- [ ] **Step 2: Write the failing test**

Create `packages/core/tests/render/axe-runner.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { injectAndRunAxe, axeVersion } from "../../src/render/axe-runner.js";
import { withChromium } from "../../src/render/browser.js";
import { RenderUnavailableError } from "../../src/render/types.js";

// Validate the inject→run→map wiring against a real browser. We constrain axe
// to a single rule (image-alt) so the assertion is deterministic and does not
// depend on axe's full WCAG ruleset (which would also flag missing <title>,
// landmarks, etc. on a minimal page). Skips cleanly when Chromium is absent.
const IMAGE_ALT_ONLY = { runOnly: { type: "rule", values: ["image-alt"] } };

describe("axe-runner", () => {
  it("axeVersion returns a semver-shaped string", () => {
    expect(axeVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("flags an <img> with no alt and passes an <img> with alt", async () => {
    try {
      const bad = await withChromium(async (page) => {
        await page.setContent(`<!doctype html><html lang="en"><body><img src="x.png"></body></html>`);
        return injectAndRunAxe(page, IMAGE_ALT_ONLY);
      });
      expect(bad.some((v) => v.ruleId === "image-alt")).toBe(true);
      expect(bad[0]!.nodes).toBeGreaterThan(0);

      const clean = await withChromium(async (page) => {
        await page.setContent(`<!doctype html><html lang="en"><body><img src="x.png" alt="a logo"></body></html>`);
        return injectAndRunAxe(page, IMAGE_ALT_ONLY);
      });
      expect(clean).toEqual([]);
    } catch (e) {
      if (!(e instanceof RenderUnavailableError)) throw e;
    }
  }, 60_000);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/render/axe-runner.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/axe-runner.js'`.

- [ ] **Step 4: Write the implementation**

Create `packages/core/src/render/axe-runner.ts`:

```ts
import axe from "axe-core";
import type { Page } from "playwright";

export interface AxeViolation {
  ruleId: string;
  impact: string;
  nodes: number;
  help: string;
}

export function axeVersion(): string {
  return axe.version;
}

/**
 * Injects the pinned axe-core source into an already-loaded page, runs it, and
 * maps each violation to a stable AxeViolation. Sorted by ruleId for
 * determinism. `runOptions` is passed straight to `axe.run` (e.g. to constrain
 * the ruleset); omit it to run axe's default WCAG ruleset.
 */
export async function injectAndRunAxe(
  page: Page,
  runOptions?: Record<string, unknown>,
): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axe.source });
  const raw = await page.evaluate(async (opts) => {
    const runner = (window as unknown as { axe: { run: (ctx: Document, o?: unknown) => Promise<{ violations: Array<{ id: string; impact: string | null; help: string; nodes: unknown[] }> }> } }).axe;
    const result = await runner.run(document, opts ?? { resultTypes: ["violations"] });
    return result.violations.map((v) => ({
      ruleId: v.id,
      impact: v.impact ?? "minor",
      nodes: v.nodes.length,
      help: v.help,
    }));
  }, runOptions);
  return [...raw].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

/** Navigates to a story's iframe URL, then injects + runs axe on it. */
export async function runAxeOnStory(
  page: Page,
  storyUrl: string,
  runOptions?: Record<string, unknown>,
): Promise<AxeViolation[]> {
  await page.goto(storyUrl, { waitUntil: "load" });
  return injectAndRunAxe(page, runOptions);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/render/axe-runner.test.ts`
Expected: PASS (or skip if Chromium absent — the `axeVersion` test still passes).

- [ ] **Step 6: Typecheck**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm build`
Expected: no type errors. If `import axe from "axe-core"` errors under `verbatimModuleSyntax`, axe-core ships its own types and a default export; confirm `node_modules/axe-core/axe.d.ts` declares `export = axe` / a default. If TS complains, use `import * as axe from "axe-core"` and access `axe.source` / `axe.version` the same way.

- [ ] **Step 7: Commit**

```bash
cd /Users/noechague/dev/lyse
git add packages/core/src/render/axe-runner.ts packages/core/tests/render/axe-runner.test.ts packages/core/package.json pnpm-lock.yaml
git commit -m "feat(render): axe-core runner (inject + run + map violations)"
```

---

### Task 2: storybook-source — locate a pre-built Storybook and enumerate stories

**Files:**
- Create: `packages/core/src/render/storybook-source.ts`
- Test: `packages/core/tests/render/storybook-source.test.ts`

**Interfaces:**
- Consumes: Node `fs`/`path`/`url` built-ins only. No browser.
- Produces:
  - `interface StorybookSource { kind: "static" | "url"; base: string; index: unknown }`
  - `interface StoryRef { id: string; title: string; url: string }`
  - `resolveStorybook(repoRoot: string, opts: { dir?: string; url?: string }): StorybookSource | null`
  - `listStories(source: StorybookSource): Promise<StoryRef[]>`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/render/storybook-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveStorybook, listStories } from "../../src/render/storybook-source.js";

function tmpRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-sb-"));
  for (const [p, c] of Object.entries(files)) {
    const abs = join(dir, p);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, c, "utf8");
  }
  return dir;
}

describe("resolveStorybook", () => {
  it("returns null when no storybook-static dir exists", () => {
    const dir = tmpRepo({ "package.json": "{}" });
    expect(resolveStorybook(dir, {})).toBeNull();
  });

  it("finds the default storybook-static/index.json", () => {
    const dir = tmpRepo({ "storybook-static/index.json": '{"v":5,"entries":{}}' });
    const src = resolveStorybook(dir, {});
    expect(src?.kind).toBe("static");
  });

  it("resolves an explicit --storybook dir (relative to repo root)", () => {
    const dir = tmpRepo({ "build/sb/index.json": '{"v":5,"entries":{}}' });
    const src = resolveStorybook(dir, { dir: "build/sb" });
    expect(src?.kind).toBe("static");
  });

  it("resolves a URL source and strips trailing slashes", () => {
    const src = resolveStorybook("/anything", { url: "https://sb.example.com/" });
    expect(src).toEqual({ kind: "url", base: "https://sb.example.com", index: null });
  });
});

describe("listStories", () => {
  it("parses Storybook v7 index.json entries, skips docs, sorts by id", async () => {
    const index = {
      v: 5,
      entries: {
        "button--secondary": { id: "button--secondary", title: "Button", name: "Secondary", type: "story" },
        "button--primary": { id: "button--primary", title: "Button", name: "Primary", type: "story" },
        "button--docs": { id: "button--docs", title: "Button", name: "Docs", type: "docs" },
      },
    };
    const dir = tmpRepo({ "storybook-static/index.json": JSON.stringify(index) });
    const src = resolveStorybook(dir, {})!;
    const stories = await listStories(src);
    expect(stories.map((s) => s.id)).toEqual(["button--primary", "button--secondary"]);
    expect(stories[0]!.url).toContain("iframe.html?id=button--primary");
    expect(stories[0]!.url.startsWith("file://")).toBe(true);
  });

  it("falls back to the legacy stories.json shape", async () => {
    const legacy = { v: 3, stories: { "card--default": { id: "card--default", title: "Card", name: "Default" } } };
    const dir = tmpRepo({ "storybook-static/stories.json": JSON.stringify(legacy) });
    const src = resolveStorybook(dir, {})!;
    const stories = await listStories(src);
    expect(stories.map((s) => s.id)).toEqual(["card--default"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/render/storybook-source.test.ts`
Expected: FAIL — `Cannot find module '../../src/render/storybook-source.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/core/src/render/storybook-source.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

export interface StorybookSource {
  kind: "static" | "url";
  base: string;
  index: unknown;
}

export interface StoryRef {
  id: string;
  title: string;
  url: string;
}

interface StoryEntry {
  id?: string;
  title?: string;
  type?: string;
}

/**
 * Locates a pre-built Storybook. URL wins if given. Otherwise checks the
 * explicit `dir` (relative to repoRoot or absolute) then the conventional
 * `storybook-static/`, looking for `index.json` (v7+) or `stories.json`
 * (legacy). Returns null when none is found — the caller treats this as N/A.
 */
export function resolveStorybook(
  repoRoot: string,
  opts: { dir?: string; url?: string },
): StorybookSource | null {
  if (opts.url) {
    return { kind: "url", base: opts.url.replace(/\/+$/, ""), index: null };
  }
  const dirs = [opts.dir, "storybook-static"].filter((d): d is string => Boolean(d));
  for (const d of dirs) {
    const base = resolve(repoRoot, d);
    for (const name of ["index.json", "stories.json"]) {
      const file = join(base, name);
      if (!existsSync(file)) continue;
      try {
        const index = JSON.parse(readFileSync(file, "utf8"));
        return { kind: "static", base, index };
      } catch {
        // malformed index — keep looking
      }
    }
  }
  return null;
}

function storyUrl(source: StorybookSource, id: string): string {
  const query = `iframe.html?id=${id}&viewMode=story`;
  if (source.kind === "url") return `${source.base}/${query}`;
  return `${pathToFileURL(join(source.base, "iframe.html")).href}?id=${id}&viewMode=story`;
}

/**
 * Enumerates non-docs stories from the resolved index. For URL sources with no
 * pre-loaded index, fetches `<base>/index.json` best-effort (returns [] on any
 * failure — never throws). Sorted by id for determinism.
 */
export async function listStories(source: StorybookSource): Promise<StoryRef[]> {
  let index = source.index;
  if (source.kind === "url" && index === null) {
    try {
      const res = await fetch(`${source.base}/index.json`);
      index = res.ok ? await res.json() : null;
    } catch {
      return [];
    }
  }
  const idx = index as { entries?: Record<string, StoryEntry>; stories?: Record<string, StoryEntry> } | null;
  const entries = idx?.entries ?? idx?.stories ?? {};
  const refs: StoryRef[] = [];
  for (const [key, entry] of Object.entries(entries)) {
    if (entry.type === "docs") continue;
    const id = entry.id ?? key;
    refs.push({ id, title: entry.title ?? "", url: storyUrl(source, id) });
  }
  return refs.sort((a, b) => a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/render/storybook-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/noechague/dev/lyse
git add packages/core/src/render/storybook-source.ts packages/core/tests/render/storybook-source.test.ts
git commit -m "feat(render): storybook-source — resolve pre-built Storybook + list stories"
```

---

### Task 3: rule `a11y/runtime-axe` + registry + catalogue + coverage classification

**Files:**
- Create: `packages/core/src/rules/a11y-runtime-axe.ts`
- Test: `packages/core/tests/rules/a11y-runtime-axe.test.ts`
- Modify: `packages/core/src/rules/registry.ts` (import + add to `ruleObjects`)
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts` (add `a11y.runtime-axe` entry; bump header count)
- Modify: `packages/core/validation/coverage.ts` (add `a11y/runtime-axe` to `EXECUTION_COVERED`)

**Interfaces:**
- Consumes: `AxeViolation` from `packages/core/src/render/axe-runner.js`; `createLyseRule` from `packages/core/src/rules/_rule-module.js`; `Finding`, `RuleContext`, `ParsedFiles`, `RuleEvalResult`, `Rule` from `packages/core/src/types.js`.
- Consumes (added in Task 4, referenced here): `ctx.axeViolations?: AxeViolation[]` and `ctx.axeStoriesProbed?: number`. This task adds those two optional fields to the `RuleContext` interface so the rule compiles; Task 4 populates them.
- Produces:
  - `detectAxeFindings(violations: AxeViolation[]): Finding[]`
  - `export const rule: Rule` (id `a11y/runtime-axe`)

- [ ] **Step 1: Add the two RuleContext fields**

In `packages/core/src/types.ts`, inside `interface RuleContext` (after the `canonicalTokens?` field, around line 112), add:

```ts
  /**
   * Runtime axe-core violations collected per story under `lyse audit --render`
   * with a resolved Storybook. Present (possibly empty) only when the axe
   * render sub-stage ran; absent otherwise. Consumed by a11y/runtime-axe.
   */
  axeViolations?: import("./render/axe-runner.js").AxeViolation[];
  /** Number of stories successfully probed by axe — the rule's denominator. */
  axeStoriesProbed?: number;
```

- [ ] **Step 2: Write the failing test**

Create `packages/core/tests/rules/a11y-runtime-axe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { detectAxeFindings, rule } from "../../src/rules/a11y-runtime-axe.js";
import type { AxeViolation } from "../../src/render/axe-runner.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
const baseCtx: RuleContext = {
  repoRoot: "/x",
  tokens: null,
  componentsModule: null,
  componentInventory: [],
  storyIndex: null,
  excludePaths: [],
};

describe("detectAxeFindings", () => {
  it("maps critical/serious to error and moderate/minor to warning", () => {
    const violations: AxeViolation[] = [
      { ruleId: "image-alt", impact: "critical", nodes: 2, help: "Images must have alternate text" },
      { ruleId: "color-contrast", impact: "moderate", nodes: 1, help: "Elements must have sufficient color contrast" },
    ];
    const findings = detectAxeFindings(violations);
    expect(findings).toHaveLength(2);
    expect(findings[0]!.severity).toBe("error");
    expect(findings[0]!.ruleId).toBe("a11y/runtime-axe");
    expect(findings[0]!.message).toContain("image-alt");
    expect(findings[1]!.severity).toBe("warning");
  });

  it("returns no findings for an empty violation list", () => {
    expect(detectAxeFindings([])).toEqual([]);
  });
});

describe("a11y/runtime-axe rule", () => {
  it("is N/A (opportunities 0) when no axe data is present", async () => {
    const res = await rule.evaluate(baseCtx, emptyParsed);
    expect(res).toEqual({ findings: [], opportunities: 0 });
  });

  it("emits one finding per violation and counts stories probed as opportunities", async () => {
    const ctx: RuleContext = {
      ...baseCtx,
      axeViolations: [{ ruleId: "image-alt", impact: "serious", nodes: 1, help: "alt text" }],
      axeStoriesProbed: 3,
    };
    const res = await rule.evaluate(ctx, emptyParsed);
    expect(res.findings).toHaveLength(1);
    expect(res.opportunities).toBe(3);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/a11y-runtime-axe.test.ts`
Expected: FAIL — `Cannot find module '../../src/rules/a11y-runtime-axe.js'`.

- [ ] **Step 4: Write the rule**

Create `packages/core/src/rules/a11y-runtime-axe.ts`:

```ts
import { createLyseRule } from "./_rule-module.js";
import type { Finding, RuleContext, ParsedFiles, RuleEvalResult, Rule } from "../types.js";
import type { AxeViolation } from "../render/axe-runner.js";

const RULE_ID = "a11y/runtime-axe";

function impactToSeverity(impact: string): "error" | "warning" {
  return impact === "critical" || impact === "serious" ? "error" : "warning";
}

export function detectAxeFindings(violations: AxeViolation[]): Finding[] {
  return violations.map((v) => ({
    ruleId: RULE_ID,
    axis: "a11y" as const,
    severity: impactToSeverity(v.impact),
    location: { file: "<rendered>", line: 1, column: 1 },
    message: `axe-core ${v.ruleId} (${v.impact}): ${v.help} — ${v.nodes} node(s).`,
  }));
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  if (!ctx.axeViolations) return { findings: [], opportunities: 0 };
  const probed = ctx.axeStoriesProbed ?? 0;
  if (probed === 0) return { findings: [], opportunities: 0 };
  return { findings: detectAxeFindings(ctx.axeViolations), opportunities: probed };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Rendered components pass automated axe-core accessibility checks",
    fullDescription:
      "Runs axe-core against a design system's real rendered components, sourced from a pre-built Storybook (`storybook-static/` or a running URL), under `lyse audit --render`. Emits one finding per axe violation (severity from axe impact: critical/serious → error, moderate/minor → warning). N/A when no Storybook is found or `--render` is not set. Covers axe-core's automatable subset (~30% of WCAG criteria) — it complements, never replaces, manual audits.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-runtime-axe.md",
    rationale:
      "Many a11y defects (color contrast, missing alt text, ARIA misuse) only exist in the rendered DOM and are invisible to static analysis. Running axe-core on the design system's own Storybook stories catches them against the exact markup the DS ships.",
    examples: [
      {
        good: '<img src="logo.png" alt="Acme logo">',
        bad: '<img src="logo.png">',
      },
    ],
    allowlist: [
      "design systems without a pre-built Storybook — the rule is N/A",
      "runs only under `lyse audit --render`; the default audit never invokes it",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
```

- [ ] **Step 5: Register the rule**

In `packages/core/src/rules/registry.ts`:

1. Add the import alongside the other a11y imports (after line 24, `import { rule as rSemanticHtml } ...`):

```ts
import { rule as rRuntimeAxe } from "./a11y-runtime-axe.js";
```

2. Add `rRuntimeAxe` to the `ruleObjects` array. Place it after `rSemanticHtml` (keeps a11y rules grouped):

```ts
  rSemanticHtml,
  rRuntimeAxe,
```

- [ ] **Step 6: Add the SUB_AXES catalogue entry**

In `packages/core/src/reliability/catalogue/sub-axes.ts`:

1. Update the header comment on line 1 from `// 64 sub-axes, 1:1 mapped to the 64 shipped rules.` to:

```ts
// 65 sub-axes, 1:1 mapped to the 65 shipped rules.
```

2. Add this entry immediately after the `a11y.semantic-html` entry (mirrors the experimental, non-scoring shape of `tokens.rendered-token-fidelity`):

```ts
  { id: "a11y.runtime-axe", axis: "a11y", name: "Runtime a11y (axe-core on Storybook)", status: "experimental", precisionMeasured: 1, recallMeasured: 1, precisionWilsonLowerBound: 0, recallWilsonLowerBound: 0, lastCalibrated: "2026-06-23T00:00:00.000Z", contributesToScore: false, ruleIds: ["a11y/runtime-axe"], llmDriven: false },
```

- [ ] **Step 7: Classify the rule in the coverage gate**

In `packages/core/validation/coverage.ts`, add to the `EXECUTION_COVERED` record (after the `tokens/rendered-token-fidelity` entry):

```ts
  "a11y/runtime-axe":
    "execution: browser-driven oracle via evaluateAxeAdapter() — injects axe-core into a minimal DOM with a known image-alt violation (TP) vs a clean DOM (TN), validates the inject→run→map→finding wiring",
```

- [ ] **Step 8: Run the rule + parity + coverage tests**

Run:
```bash
cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/rules/a11y-runtime-axe.test.ts src/reliability/catalogue/__tests__/sub-axes.test.ts tests/validation/coverage.test.ts tests/rules/registry.test.ts tests/rules/manifest.test.ts
```
Expected: PASS. In particular `SUB_AXES.length === ruleObjects.length` (now 65) and `coverageGaps().uncovered === []`.

- [ ] **Step 9: Commit**

```bash
cd /Users/noechague/dev/lyse
git add packages/core/src/rules/a11y-runtime-axe.ts packages/core/tests/rules/a11y-runtime-axe.test.ts packages/core/src/rules/registry.ts packages/core/src/reliability/catalogue/sub-axes.ts packages/core/validation/coverage.ts packages/core/src/types.ts
git commit -m "feat(a11y): a11y/runtime-axe rule + catalogue + coverage classification"
```

---

### Task 4: pipeline + CLI wiring — collect axe violations per story under --render

**Files:**
- Modify: `packages/core/src/commands/audit-flags.ts` (add `storybook?: string` to `AuditFlags`)
- Modify: `packages/core/src/render/types.ts` (add `axeVersion?` + `storiesProbed?` to `RenderMeta`)
- Modify: `packages/core/src/commands/audit-pipeline.ts` (axe render sub-stage)
- Modify: `packages/core/src/cli.ts` (`--render` + `--storybook` args + flag assembly)
- Test: `packages/core/tests/commands/audit-render-axe.test.ts`

**Interfaces:**
- Consumes: `resolveStorybook`, `listStories` from `packages/core/src/render/storybook-source.js`; `runAxeOnStory`, `axeVersion` from `packages/core/src/render/axe-runner.js`; `withChromium` from `packages/core/src/render/browser.js`; `RenderUnavailableError` from `packages/core/src/render/types.js`.
- Produces: populates `ctx.axeViolations` + `ctx.axeStoriesProbed`; sets `meta.render.axeVersion` + `meta.render.storiesProbed`. Honors `flags.render` + `flags.storybook`.

- [ ] **Step 1: Extend RenderMeta and AuditFlags**

In `packages/core/src/render/types.ts`, add two optional fields to `interface RenderMeta` (after `error?`):

```ts
  /** axe-core version injected during the runtime-axe sub-stage (render mode + Storybook). */
  axeVersion?: string;
  /** Number of Storybook stories successfully probed by axe. */
  storiesProbed?: number;
```

In `packages/core/src/commands/audit-flags.ts`, add to `interface AuditFlags` (after `render?: boolean;`):

```ts
  /** Optional Storybook source for the runtime-axe sub-stage: a static dir (relative to repo root or absolute) or a running URL. */
  storybook?: string;
```

- [ ] **Step 2: Write the failing pipeline test**

Create `packages/core/tests/commands/audit-render-axe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function tmp(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-axe-"));
  for (const [p, c] of Object.entries(files)) {
    const abs = join(dir, p);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, c, "utf8");
  }
  return dir;
}

describe("audit --render runtime-axe sub-stage", () => {
  it("render with no Storybook: runtime-axe is N/A and the audit does not crash", async () => {
    const dir = tmp({ "package.json": '{"name":"x","version":"1.0.0"}', "src/t.css": ":root{--bg:#fff;}" });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    const axeFindings = result.findings.filter((f) => f.ruleId === "a11y/runtime-axe");
    expect(axeFindings).toHaveLength(0);
  });

  it("render with a Storybook whose stories fail to render: probes attempted, no crash, no false findings", async () => {
    // A real index.json but no bundled iframe.html — every story navigation
    // fails and is skipped (degrade). storiesProbed ends at 0, no findings.
    const index = { v: 5, entries: { "button--primary": { id: "button--primary", title: "Button", name: "Primary", type: "story" } } };
    const dir = tmp({
      "package.json": '{"name":"x","version":"1.0.0"}',
      "storybook-static/index.json": JSON.stringify(index),
    });
    const { result } = await auditDirectory(dir, { staticOnly: true, render: true });
    expect(result.findings.filter((f) => f.ruleId === "a11y/runtime-axe")).toHaveLength(0);
    // meta.render is present whenever render mode ran; storiesProbed reflects successes.
    if (result.meta?.render?.storiesProbed !== undefined) {
      expect(result.meta.render.storiesProbed).toBe(0);
    }
  }, 60_000);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/commands/audit-render-axe.test.ts`
Expected: FAIL — the second test may pass trivially, but the import/wiring of the axe sub-stage does not exist yet; the assertion that `a11y/runtime-axe` is correctly N/A (not throwing) drives the implementation. (If both pass before any change, proceed — the wiring in Step 5 is still required for the feature; the test then guards against regressions.)

- [ ] **Step 4: Add the imports to audit-pipeline.ts**

In `packages/core/src/commands/audit-pipeline.ts`, near the existing render imports (lines 42-47), add:

```ts
import { resolveStorybook, listStories } from "../render/storybook-source.js";
import { runAxeOnStory, axeVersion } from "../render/axe-runner.js";
```

- [ ] **Step 5: Add the axe render sub-stage**

In `packages/core/src/commands/audit-pipeline.ts`, the existing render block ends after the token-fidelity logic (around line 383, the closing `}` of `if (flags?.render) {`). Insert the axe sub-stage INSIDE that `if (flags?.render)` block, after the token-fidelity logic but before its closing brace. It is independent of the DTCG token path (axe runs whether or not a DTCG source exists):

```ts
    // Runtime-axe sub-stage — independent of token-fidelity. Resolves a
    // pre-built Storybook (never builds the repo) and runs axe-core per story.
    // Degrades per story: a story that fails to render is skipped, others
    // continue. No Storybook → leaves axeViolations unset (rule is N/A).
    const sbOpts: { dir?: string; url?: string } = {};
    if (flags.storybook !== undefined) {
      if (/^https?:\/\//.test(flags.storybook)) sbOpts.url = flags.storybook;
      else sbOpts.dir = flags.storybook;
    }
    const storybook = resolveStorybook(absoluteRoot, sbOpts);
    if (storybook) {
      try {
        const stories = await listStories(storybook);
        const collected = await withChromium(async (page) => {
          const violations: import("../render/axe-runner.js").AxeViolation[] = [];
          let probed = 0;
          for (const story of stories) {
            try {
              violations.push(...(await runAxeOnStory(page, story.url)));
              probed++;
            } catch {
              // story failed to render — skip, continue with the rest
            }
          }
          return { violations, probed };
        });
        ctx.axeViolations = collected.violations.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
        ctx.axeStoriesProbed = collected.probed;
        const base = renderMeta ?? { chromiumVersion: "n/a", skippedNonCanonicalizable: 0 };
        renderMeta = { ...base, axeVersion: axeVersion(), storiesProbed: collected.probed };
      } catch (e) {
        const base = renderMeta ?? { chromiumVersion: "n/a", skippedNonCanonicalizable: 0 };
        renderMeta = { ...base, error: e instanceof RenderUnavailableError ? e.message : String(e) };
      }
    }
```

`axeVersion()` is pure (reads `axe.version`, no browser), so it is safe to call outside the `withChromium` block. `chromiumVersion` is left to whatever the token-fidelity sub-stage set (or `"n/a"`); the presence of `axeVersion`/`storiesProbed` is what signals the axe stage ran. Threading the real Chromium version through `withChromium` is a deliberate non-goal for this MVP.

- [ ] **Step 6: Wire the CLI flags**

In `packages/core/src/cli.ts`, in the audit command's `args` block (after the `dim` arg, around line 231), add:

```ts
    render: {
      type: "boolean",
      default: false,
      description: "Opt-in: render the design system in headless Chromium (token-fidelity drift + axe-core a11y on a pre-built Storybook). Requires Playwright.",
    },
    storybook: {
      type: "string",
      description: "Storybook source for runtime a11y: a pre-built static dir (e.g. storybook-static) or a running URL. Used only with --render.",
    },
```

Then in the `auditFlags` object (around line 289-304), add these spreads:

```ts
      ...(args["render"] === true ? { render: true } : {}),
      ...(typeof args["storybook"] === "string" && args["storybook"]
        ? { storybook: args["storybook"] as string }
        : {}),
```

- [ ] **Step 7: Run the pipeline test + the existing render test (no regressions)**

Run:
```bash
cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/commands/audit-render-axe.test.ts tests/commands/audit-render.test.ts
```
Expected: PASS. The existing `audit-render.test.ts` assertions (`error: "no DTCG token source"`, `chromiumVersion: "n/a"` when no DTCG and no storybook) must still hold — the axe sub-stage only runs when a Storybook resolves, so those no-storybook cases are unaffected.

- [ ] **Step 8: Typecheck + build**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm build`
Expected: no type errors.

- [ ] **Step 9: Manual smoke (optional, documents the user-facing path)**

Run: `cd /Users/noechague/dev/lyse && node packages/core/dist/cli.js audit fixtures/full-ds/ --render --static-only`
Expected: completes cleanly; no `a11y/runtime-axe` findings (fixture has no Storybook → N/A). Confirms the `--render` flag is accepted.

- [ ] **Step 10: Commit**

```bash
cd /Users/noechague/dev/lyse
git add packages/core/src/commands/audit-flags.ts packages/core/src/render/types.ts packages/core/src/commands/audit-pipeline.ts packages/core/src/cli.ts packages/core/tests/commands/audit-render-axe.test.ts
git commit -m "feat(render): wire runtime-axe sub-stage + --render/--storybook CLI flags"
```

---

### Task 5: execution-oracle adapter — validate the axe→finding wiring (J=1)

**Files:**
- Create: `packages/core/validation/axe-adapters.ts`
- Test: `packages/core/tests/validation/axe-adapters.test.ts`

**Interfaces:**
- Consumes: `withChromium` from `packages/core/src/render/browser.js`; `injectAndRunAxe` from `packages/core/src/render/axe-runner.js`; `detectAxeFindings` from `packages/core/src/rules/a11y-runtime-axe.js`; `emptyMatrix`, `addObservation`, `youdensJ` from `packages/core/validation/score.js`; `RuleScore` from `packages/core/validation/types.js`.
- Produces: `evaluateAxeAdapter(): Promise<RuleScore>` (oracleKind `"execution"`, ruleId `a11y/runtime-axe`). Mirrors `evaluateRenderAdapter` in `validation/render-adapters.ts` — runs in the render test lane, NOT in the static `validate:autonomous` runner.

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/validation/axe-adapters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { evaluateAxeAdapter } from "../../validation/axe-adapters.js";
import { RenderUnavailableError } from "../../src/render/types.js";

describe("axe execution-oracle adapter", () => {
  // Construction oracle: a minimal DOM with a KNOWN image-alt violation (TP)
  // vs a clean DOM (TN). Constrained to the image-alt rule so the labels are
  // ground-truth-by-construction and deterministic. Validates Lyse's
  // inject→run→map→detectAxeFindings wiring, not axe-core itself.
  it("J=1: img-without-alt flagged (fn=0), clean img not flagged (fp=0)", async () => {
    try {
      const score = await evaluateAxeAdapter();
      expect(score.matrix.fn).toBe(0);
      expect(score.matrix.fp).toBe(0);
      expect(score.youdensJ).toBe(1);
      expect(score.ruleId).toBe("a11y/runtime-axe");
      expect(score.oracleKind).toBe("execution");
    } catch (e) {
      if (!(e instanceof RenderUnavailableError)) throw e;
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/validation/axe-adapters.test.ts`
Expected: FAIL — `Cannot find module '../../validation/axe-adapters.js'`.

- [ ] **Step 3: Write the adapter**

Create `packages/core/validation/axe-adapters.ts`:

```ts
import { withChromium } from "../src/render/browser.js";
import { injectAndRunAxe } from "../src/render/axe-runner.js";
import { detectAxeFindings } from "../src/rules/a11y-runtime-axe.js";
import { emptyMatrix, addObservation, youdensJ } from "./score.js";
import type { RuleScore } from "./types.js";

// Constrain axe to a single rule so the construction labels are exact and
// deterministic (axe's full ruleset would also flag missing <title>, etc.).
const IMAGE_ALT_ONLY = { runOnly: { type: "rule", values: ["image-alt"] } };

// TN: img has alt → no image-alt violation → not flagged.
const CLEAN_HTML = `<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x.png" alt="a logo"></body></html>`;
// TP: img has no alt → image-alt violation → flagged.
const VIOLATION_HTML = `<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x.png"></body></html>`;

async function probe(html: string): Promise<ReturnType<typeof detectAxeFindings>> {
  const violations = await withChromium(async (page) => {
    await page.setContent(html);
    return injectAndRunAxe(page, IMAGE_ALT_ONLY);
  });
  return detectAxeFindings(violations);
}

/**
 * Execution-oracle for a11y/runtime-axe. Drives a known-violation DOM and a
 * clean DOM through real Chromium + axe-core, then runs detectAxeFindings to
 * classify each (TP/TN). Throws RenderUnavailableError when Chromium is absent;
 * callers (tests) catch and skip. Runs in the render lane, not the static runner.
 */
export async function evaluateAxeAdapter(): Promise<RuleScore> {
  let matrix = emptyMatrix();

  const clean = await probe(CLEAN_HTML);
  matrix = addObservation(matrix, false, clean.length > 0);

  const bad = await probe(VIOLATION_HTML);
  matrix = addObservation(matrix, true, bad.length > 0);

  return {
    ruleId: "a11y/runtime-axe",
    oracleKind: "execution",
    matrix,
    youdensJ: youdensJ(matrix),
    metamorphicInconsistencies: [],
    mutationsRun: 1,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/noechague/dev/lyse/packages/core && pnpm vitest run tests/validation/axe-adapters.test.ts`
Expected: PASS (or clean skip if Chromium absent).

- [ ] **Step 5: Commit**

```bash
cd /Users/noechague/dev/lyse
git add packages/core/validation/axe-adapters.ts packages/core/tests/validation/axe-adapters.test.ts
git commit -m "test(validation): execution-oracle adapter for a11y/runtime-axe (J=1)"
```

---

### Task 6: documentation + changeset

**Files:**
- Create: `docs/rules/a11y-runtime-axe.md`
- Modify: `README.md` (rules table / render section)
- Modify: `CHANGELOG.md` (`[Unreleased]`)
- Create: `.changeset/runtime-axe-storybook.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write the rule doc**

Create `docs/rules/a11y-runtime-axe.md`. Match the structure of an existing rule doc — first inspect one for the exact heading conventions:

```bash
cat /Users/noechague/dev/lyse/docs/rules/a11y-html-lang.md
```

Then write `docs/rules/a11y-runtime-axe.md` with the same sections, content:

```markdown
# a11y/runtime-axe

**Axis:** a11y · **Default severity:** warning · **Status:** experimental (does not contribute to the Health Score) · **Render-only** (`lyse audit --render`)

## What it checks

Runs [axe-core](https://github.com/dequelabs/axe-core) against your design system's real rendered components, sourced from a **pre-built Storybook** (`storybook-static/` or a running URL). Each axe violation becomes one Lyse finding. Severity maps from axe impact: `critical`/`serious` → error, `moderate`/`minor` → warning.

This catches runtime a11y defects — color contrast, missing alt text, ARIA misuse — that live only in the rendered DOM and are invisible to static analysis.

## How to run

```bash
# Build your Storybook first (Lyse never builds it for you):
npx storybook build            # produces storybook-static/

# Then audit with the render layer enabled:
lyse audit --render                                   # auto-detects ./storybook-static
lyse audit --render --storybook path/to/storybook-static
lyse audit --render --storybook https://your-storybook.example.com
```

Requires Playwright + Chromium: `npm i -D playwright && npx playwright install chromium`. If absent, the render layer skips cleanly.

## When it is N/A

- No `--render` flag.
- No Storybook found or provided.
- Playwright/Chromium not installed.
- A story fails to render — it is skipped; the rest continue.

## Scope and honesty

axe-core automates roughly 30% of WCAG success criteria. A clean runtime-axe result is **not** a guarantee of accessibility — it complements, never replaces, manual audits and assistive-technology testing.

## Examples

Bad:

```html
<img src="logo.png">
```

Good:

```html
<img src="logo.png" alt="Acme logo">
```
```

- [ ] **Step 2: Update README**

Inspect how the README lists rules / the render layer:

```bash
grep -n "rendered-token-fidelity\|--render\|## Rules\|a11y/" /Users/noechague/dev/lyse/README.md | head
```

Add `a11y/runtime-axe` wherever `tokens/rendered-token-fidelity` and the `--render` layer are documented, in the same format the README already uses for those entries (one row/line describing: runtime a11y via axe-core on a pre-built Storybook, render-only, experimental).

- [ ] **Step 3: Update CHANGELOG**

In `CHANGELOG.md`, under the `[Unreleased]` heading's `### Added` list (create the heading if missing), add:

```markdown
- `a11y/runtime-axe`: runtime accessibility checks via axe-core on a pre-built Storybook, under the opt-in `lyse audit --render`. New `--storybook <dir|url>` flag. Experimental (does not affect the Health Score).
```

- [ ] **Step 4: Add the changeset**

Create `.changeset/runtime-axe-storybook.md`:

```markdown
---
"@lyse-labs/lyse": minor
---

Add `a11y/runtime-axe`: runtime accessibility checks via axe-core against a pre-built Storybook (`storybook-static/` or a URL), under the opt-in `lyse audit --render`. Adds the `--render` and `--storybook` CLI flags. Experimental rule — does not contribute to the Health Score.
```

- [ ] **Step 5: Verify the changeset is valid**

Run: `cd /Users/noechague/dev/lyse && pnpm changeset status`
Expected: lists the pending `@lyse-labs/lyse` minor bump with no errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/noechague/dev/lyse
git add docs/rules/a11y-runtime-axe.md README.md CHANGELOG.md .changeset/runtime-axe-storybook.md
git commit -m "docs(a11y): document a11y/runtime-axe + changeset"
```

---

### Task 7: full suite + smoke verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full core test suite**

Run: `cd /Users/noechague/dev/lyse && pnpm test`
Expected: all green. Pay attention to: `SUB_AXES` parity (65 = 65), `coverageGaps().uncovered === []`, manifest count, the new render/axe tests (pass or clean-skip).

- [ ] **Step 2: Smoke-test the documented commands**

Run:
```bash
cd /Users/noechague/dev/lyse
node packages/core/dist/cli.js audit fixtures/full-ds/ --render --static-only
node packages/core/dist/cli.js audit packages/core/ --render --static-only
```
Expected: both complete cleanly (no Storybook in either → runtime-axe N/A), no crash, stable Health Score unchanged from the non-`--render` run.

- [ ] **Step 3: Confirm the default audit is unchanged**

Run: `cd /Users/noechague/dev/lyse && node packages/core/dist/cli.js audit fixtures/full-ds/ --static-only`
Expected: identical Health Score to before this branch (runtime-axe never runs without `--render`; default audit untouched).
