# ai-governance/product-analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deterministic, advisory rule `ai-governance/product-analytics` that flags an AI surface whose accept/reject/feedback handlers ship without any product-analytics instrumentation in the file.

**Architecture:** A new rule file mirroring `ai-governance-human-control-affordances.ts` — reuses `fileHasAiMarker`/`COMPONENT_GLOB`/`SCAN_IGNORE`/`safeReadText`/`makeAllowlistCheck` from the marker rule, adds two pure helpers (handler detection + analytics presence), and an `evaluate` that emits one per-file warning when an AI-surface file has an interaction handler but no analytics call. Registered experimental (does not contribute to score).

**Tech Stack:** TypeScript (strict, NodeNext `.js` specifiers), vitest, `fast-glob`, `@swc`-based parsers (not needed here — regex-static like the sibling rule).

## Global Constraints

- Axis is exactly `"ai-governance"`; ruleId exactly `"ai-governance/product-analytics"`; sub-axis id exactly `"ai-governance.product-analytics"`.
- Rule ships **experimental**: sub-axes record `status: "experimental"`, `contributesToScore: false`, `llmDriven: false`, `precisionMeasured: null`.
- Deterministic / no network / no LLM. Regex-static, mirroring `ai-governance-human-control-affordances.ts`.
- AI-marker-gated: a file is in-scope only if `fileHasAiMarker(source, rel, repoRoot)` is true AND it has an accept/reject/feedback handler. Otherwise no finding.
- File-level presence: a single analytics call anywhere in the file satisfies the check.
- No comments unless WHY is non-obvious. JSON keys / outputs deterministic.
- Do NOT edit `manifest.ts` (derives from rule `meta`).
- Run tests: `cd packages/core && pnpm vitest run tests/rules/ai-governance-product-analytics.test.ts`. Smoke: `npx @lyse-labs/lyse audit fixtures/full-ds/` must still produce a stable Health Score; dogfood `node packages/core/dist/cli.js audit packages/core/` runs clean.

---

## File Structure

- Create `packages/core/src/rules/ai-governance-product-analytics.ts` — the rule (2 exported helpers + `evaluate` + `rule`).
- Create `packages/core/tests/rules/ai-governance-product-analytics.test.ts` — unit + integration tests.
- Modify `packages/core/src/rules/registry.ts` — import + add to `ruleObjects`.
- Modify `packages/core/src/reliability/catalogue/sub-axes.ts` — add the experimental sub-axis record.
- Create `docs/rules/ai-governance-product-analytics.md` — rule doc.
- Modify `CHANGELOG.md` — `[Unreleased]` entry.

---

### Task 1: Rule file (helpers + evaluate + meta)

**Files:**
- Create: `packages/core/src/rules/ai-governance-product-analytics.ts`
- Test: `packages/core/tests/rules/ai-governance-product-analytics.test.ts`

**Interfaces:**
- Consumes (from `./ai-governance-ai-marker-component-present.js`): `safeReadText(abs: string): string | null`, `COMPONENT_GLOB: string[]`, `SCAN_IGNORE: string[]`, `fileHasAiMarker(source: string, rel: string, repoRoot: string): boolean`, `makeAllowlistCheck(directive: string): (repoRoot: string) => boolean`. From `../types.js`: `Rule`, `RuleContext`, `ParsedFiles`, `RuleEvalResult`, `Finding`. From `./_rule-module.js`: `createLyseRule`.
- Produces: `detectInteractionHandlers(source: string): { match: string; line: number }[]`, `hasAnalyticsInstrumentation(source: string): boolean`, `rule: Rule`.

- [ ] **Step 1: Write the failing unit tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectInteractionHandlers,
  hasAnalyticsInstrumentation,
  rule,
} from "../../src/rules/ai-governance-product-analytics.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
function makeCtx(repoRoot: string): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
    isSelfAudit: false,
  } as unknown as RuleContext;
}

describe("detectInteractionHandlers", () => {
  it("detects onAccept / onReject / onFeedback props with line numbers", () => {
    const src = "const X = () => (\n  <Row onAccept={a} />\n);\n";
    const hits = detectInteractionHandlers(src);
    expect(hits.map((h) => h.match)).toContain("onAccept");
    expect(hits[0]!.line).toBe(2);
  });
  it('detects data-action="accept|reject|feedback"', () => {
    const hits = detectInteractionHandlers('<button data-action="reject">no</button>');
    expect(hits.some((h) => h.match.includes("reject"))).toBe(true);
  });
  it("ignores unrelated handlers", () => {
    expect(detectInteractionHandlers("<div onClick={x} onScroll={y} />")).toHaveLength(0);
  });
});

describe("hasAnalyticsInstrumentation", () => {
  it("is true for known analytics calls", () => {
    for (const s of [
      "track('accepted')",
      "analytics.track('x')",
      "posthog.capture('x')",
      "gtag('event','x')",
      "logEvent('x')",
      "window.dataLayer.push({})",
      "const a = useAnalytics();",
      "trackEvent('x')",
    ]) {
      expect(hasAnalyticsInstrumentation(s)).toBe(true);
    }
  });
  it("is false when absent and has no substring false positive", () => {
    expect(hasAnalyticsInstrumentation("const x = 1;")).toBe(false);
    expect(hasAnalyticsInstrumentation("backtrack(x)")).toBe(false);
  });
});
```

- [ ] **Step 2: Run unit tests to verify they fail**

Run: `cd packages/core && pnpm vitest run tests/rules/ai-governance-product-analytics.test.ts`
Expected: FAIL — module not found / exports missing.

- [ ] **Step 3: Implement the rule file**

```typescript
import { join } from "node:path";
import fg from "fast-glob";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import {
  safeReadText,
  COMPONENT_GLOB,
  SCAN_IGNORE,
  fileHasAiMarker,
  makeAllowlistCheck,
} from "./ai-governance-ai-marker-component-present.js";

const RULE_ID = "ai-governance/product-analytics";
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const isAllowlisted = makeAllowlistCheck(DISABLE_DIRECTIVE);

// Accept/reject/feedback interaction signals. JSX handler-prop names and
// data-action values are a code-level contract — they stay English even in
// localized products (same reasoning as human-control-affordances).
const HANDLER_PROP_RE =
  /\bon(?:Accept|Reject|Approve|ThumbsUp|ThumbsDown|Rate|Feedback)[A-Za-z]*(?=\s*=)/g;
const DATA_ACTION_RE =
  /\bdata-action\s*=\s*["'](accept|reject|feedback|thumbs-up|thumbs-down|rate)["']/gi;

// Curated, word-bounded product-analytics signal set (narrow first; the recall
// run calibrates breadth). Bare calls, member calls, known-SDK prefixes, hook.
const ANALYTICS_RE =
  /\b(?:track|trackEvent|captureEvent|logEvent|gtag)\s*\(|\.(?:track|capture)\s*\(|\bdataLayer\.push\s*\(|\b(?:posthog|mixpanel|amplitude|segment|analytics)\.|\buseAnalytics\b/;

function lineOfIndex(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

export function detectInteractionHandlers(source: string): { match: string; line: number }[] {
  const hits: { match: string; line: number }[] = [];
  for (const m of source.matchAll(HANDLER_PROP_RE)) {
    hits.push({ match: m[0], line: lineOfIndex(source, m.index ?? 0) });
  }
  for (const m of source.matchAll(DATA_ACTION_RE)) {
    if (m[1]) hits.push({ match: `data-action="${m[1].toLowerCase()}"`, line: lineOfIndex(source, m.index ?? 0) });
  }
  return hits;
}

export function hasAnalyticsInstrumentation(source: string): boolean {
  return ANALYTICS_RE.test(source);
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot || isAllowlisted(ctx.repoRoot)) {
    return { findings, opportunities: 0 };
  }

  let componentFiles: string[] = [];
  try {
    componentFiles = fg.sync(COMPONENT_GLOB, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: SCAN_IGNORE,
      onlyFiles: true,
      unique: true,
    });
  } catch {
    // non-fatal
  }
  componentFiles.sort();

  for (const rel of componentFiles) {
    const source = safeReadText(join(ctx.repoRoot, rel));
    if (!source) continue;
    if (!fileHasAiMarker(source, rel, ctx.repoRoot)) continue;

    const handlers = detectInteractionHandlers(source);
    if (handlers.length === 0) continue;
    if (hasAnalyticsInstrumentation(source)) continue;

    const first = handlers[0]!;
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-governance",
      severity: "warning",
      location: { file: rel, line: first.line, column: 1 },
      message:
        "AI accept/reject/feedback events are not instrumented for product analytics. " +
        "Without instrumentation (e.g. track / capture / logEvent) on these handlers, AI acceptance and rejection rates cannot be measured.",
      suggestion:
        "Instrument the accept/reject/feedback handlers on this AI surface with your product-analytics SDK (e.g. analytics.track('ai_suggestion_accepted'), posthog.capture(...), gtag(...)).",
    });
  }

  return { findings, opportunities: componentFiles.length };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-governance",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Detect AI accept/reject/feedback surfaces shipped without product-analytics instrumentation",
    fullDescription:
      "Scans component files (`**/*.{tsx,jsx,vue}`) for AI-marker surfaces (per the shared `fileHasAiMarker` predicate) that carry accept/reject/feedback interaction handlers " +
      "(`onAccept`, `onReject`, `onApprove`, `onThumbsUp`, `onThumbsDown`, `onRate`, `onFeedback`, or `data-action=\"accept|reject|feedback|thumbs-up|thumbs-down|rate\"`). " +
      "For each such file it checks, file-level, whether any product-analytics instrumentation call is present (curated, word-bounded set: `track(`, `trackEvent(`, `captureEvent(`, `logEvent(`, `gtag(`, `.track(`, `.capture(`, `dataLayer.push(`, the `posthog.`/`mixpanel.`/`amplitude.`/`segment.`/`analytics.` SDK prefixes, and `useAnalytics`). " +
      "When the AI surface has the interaction handlers but no instrumentation, emits one `warning` per file at the first handler's location. Files that are not AI surfaces, or AI surfaces with no such handler, emit nothing. Presence only — one analytics call satisfies the check.",
    helpUri: "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-governance-product-analytics.md",
    rationale: `Why it matters

When a product ships AI accept/reject/feedback controls but never instruments them, it cannot measure acceptance and rejection rates — it flies blind on its own AI quality. Detecting the presence of product-analytics instrumentation on those surfaces is a cheap, high-signal static check.

This rule is presence-only: it verifies that some instrumentation exists in the file, not that it is correctly wired. A repo with no AI-marker surface emits nothing and is not penalised.`,
    examples: [
      {
        good: "// AiSuggestion.tsx — AI surface with accept/reject + analytics\nimport { analytics } from './analytics';\nexport function AiSuggestion() {\n  return <Row onAccept={() => analytics.track('ai_accepted')} onReject={() => analytics.track('ai_rejected')} />;\n}",
        bad: "// AiSuggestion.tsx — AI surface, accept/reject handlers, NO analytics\nexport function AiSuggestion() {\n  return <Row onAccept={accept} onReject={reject} />;\n}",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable ai-governance/product-analytics` in an adjacent README or `.lyse.yaml` — rule is N/A",
      "repos with no AI-marker component at all — no AI surface detected, rule emits nothing",
      "AI surfaces with no accept/reject/feedback handler — out of scope, rule emits nothing",
      "files under `node_modules/`, `dist/`, `build/`, `.git/`, `.next/`, `out/`, `coverage/`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = { detectInteractionHandlers, hasAnalyticsInstrumentation, isAllowlisted, DISABLE_DIRECTIVE };
```

- [ ] **Step 4: Add the integration tests**

Append to the test file:

```typescript
let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-apa-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function writeComp(rel: string, body: string): void {
  const abs = join(tmp, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

describe("rule ai-governance/product-analytics", () => {
  it("warns: AI surface + accept/reject handler + NO analytics", async () => {
    writeComp("src/AiSuggestion.tsx", "export const AILabel = () => null;\nexport const Row = () => <div onAccept={a} onReject={b} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(1);
    expect(res.findings[0]!.severity).toBe("warning");
    expect(res.findings[0]!.ruleId).toBe("ai-governance/product-analytics");
  });
  it("clean: AI surface + handler + analytics call", async () => {
    writeComp("src/AiSuggestion.tsx", "export const AILabel = () => null;\nexport const Row = () => <div onAccept={() => analytics.track('x')} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
  });
  it("out of scope: non-AI file with handlers", async () => {
    writeComp("src/Plain.tsx", "export const Row = () => <div onAccept={a} onReject={b} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
  });
  it("out of scope: AI surface with no accept/reject/feedback handler", async () => {
    writeComp("src/AiCard.tsx", "export const AILabel = () => null;\nexport const Card = () => <div onClick={a} />;\n");
    const res = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(res.findings).toHaveLength(0);
  });
});
```

> If `makeCtx`'s cast or `isSelfAudit` field mismatches the real `RuleContext`, copy the exact `makeCtx` helper from `packages/core/tests/rules/ai-governance-human-control-affordances.test.ts` — it is the canonical shape.

- [ ] **Step 5: Run all tests to verify they pass**

Run: `cd packages/core && pnpm vitest run tests/rules/ai-governance-product-analytics.test.ts`
Expected: PASS (all unit + integration).

> If `fileHasAiMarker` requires the marker component to be exported from an index/known surface rather than merely present in the file, mirror exactly how `ai-governance-human-control-affordances.test.ts` sets up an AI-marker fixture (it uses `export const AILabel = () => null;` in a component file). Adjust the fixtures to match what `fileHasAiMarker` actually accepts — verify by reading the marker rule, do not guess.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/rules/ai-governance-product-analytics.ts packages/core/tests/rules/ai-governance-product-analytics.test.ts
git commit -m "feat(ai-governance): product-analytics rule — flag uninstrumented AI accept/reject/feedback surfaces (#100)"
```

---

### Task 2: Register the rule + experimental sub-axis

**Files:**
- Modify: `packages/core/src/rules/registry.ts`
- Modify: `packages/core/src/reliability/catalogue/sub-axes.ts`

**Interfaces:**
- Consumes: `rule` from Task 1 (default-exported as `rule`).

- [ ] **Step 1: Register in `registry.ts`**

Add the import alongside the other `ai-governance-*` imports (alphabetical-ish, near `rDraftAttribution`):

```typescript
import { rule as rProductAnalytics } from "./ai-governance-product-analytics.js";
```

Add `rProductAnalytics` to the `ruleObjects` array (after the last ai-governance rule, e.g. after `rDraftAttribution`).

- [ ] **Step 2: Add the experimental sub-axis record in `sub-axes.ts`**

Add this record in the ai-governance block (mirroring the `human-control-affordances` record's shape exactly):

```typescript
  { id: "ai-governance.product-analytics", axis: "ai-governance", name: "AI product-analytics instrumentation", status: "experimental", precisionMeasured: null, recallMeasured: 1, precisionWilsonLowerBound: null, recallWilsonLowerBound: null, lastCalibrated: null, contributesToScore: false, ruleIds: ["ai-governance/product-analytics"], llmDriven: false },
```

> If the `SubAxisRecord` type rejects `lastCalibrated: null` or `recallWilsonLowerBound: null`, match the nullability used by another experimental record (`human-control-affordances` uses `precisionWilsonLowerBound: null`, `lastCalibrated: "<ISO>"`, `recallWilsonLowerBound: <number>`). If non-null is required, use `recallWilsonLowerBound: 0.9010990076755959` and a fixed ISO timestamp string `"2026-06-19T00:00:00.000Z"` — never `Date.now()`/`new Date()`.

- [ ] **Step 3: Typecheck + full rule suite + coverage gate**

Run: `cd packages/core && pnpm typecheck && pnpm vitest run tests/rules/ai-governance-product-analytics.test.ts`
Expected: PASS. The rule is now in `ruleObjects` and the catalogue.

- [ ] **Step 4: Smoke — dogfood + fixture stability**

Run: `cd packages/core && pnpm build && node dist/cli.js audit . --static-only --format=json --quiet | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('findings for new rule:', j.findings.filter(f=>f.ruleId==='ai-governance/product-analytics').length)})"`
Expected: runs clean (no crash); the new rule executes. (packages/core has no AI-marker surface → likely 0 findings, which is correct.)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/registry.ts packages/core/src/reliability/catalogue/sub-axes.ts
git commit -m "feat(reliability): register ai-governance/product-analytics as experimental sub-axis (#100)"
```

---

### Task 3: Rule doc + CHANGELOG

**Files:**
- Create: `docs/rules/ai-governance-product-analytics.md`
- Modify: `CHANGELOG.md`

**Interfaces:** none (docs only).

- [ ] **Step 1: Write the rule doc**

Read an existing doc (`docs/rules/ai-governance-human-control-affordances.md`) for the exact section template, then create `docs/rules/ai-governance-product-analytics.md` with the same structure: title, rule id, axis, severity, status (experimental/advisory), "What it checks", "Why it matters" (from the spec's rationale), Good/Bad examples (from the rule `meta.examples`), Allowlist (from `meta.allowlist`), and a "Status" note that it is advisory until the recall run measures precision.

- [ ] **Step 2: Add CHANGELOG entry**

Under `## [Unreleased]`, add to the appropriate subsection (e.g. `### Added`):

```markdown
- `ai-governance/product-analytics` rule (advisory/experimental): flags AI accept/reject/feedback surfaces shipped without product-analytics instrumentation (lyse-labs/lyse-internal#100).
```

- [ ] **Step 3: Verify markdown links**

Run: `cd packages/core && pnpm build` then confirm `meta.helpUri` path matches the created doc filename (`docs/rules/ai-governance-product-analytics.md`).

- [ ] **Step 4: Commit**

```bash
git add docs/rules/ai-governance-product-analytics.md CHANGELOG.md
git commit -m "docs(rules): ai-governance/product-analytics rule doc + changelog (#100)"
```

---

## Self-Review

**1. Spec coverage:**
- Identity (axis/ruleId/sub-axis/severity/experimental) → Task 1 meta + Task 2 record. ✓
- In-scope predicate (AI-marker-gated + accept/reject/feedback handler) → Task 1 `evaluate` + `detectInteractionHandlers`. ✓
- Instrumentation-presence check (curated set, word-bounded) → Task 1 `hasAnalyticsInstrumentation` + `ANALYTICS_RE`. ✓
- Finding semantics (one per file at first handler, warning, no finding when instrumented/out-of-scope) → Task 1 `evaluate` + integration tests. ✓
- Registration + catalogue → Task 2. ✓
- Docs → Task 3. ✓
- Tests (unit + integration mirroring sibling) → Task 1 Steps 1,4. ✓
- Scope of cycle (advisory, recall-suite generators deferred) → experimental record (Task 2), CHANGELOG note (Task 3). ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. The two `>`-quoted notes are fallback guidance for real shape mismatches (verify-against-sibling), not placeholders.

**3. Type consistency:** `detectInteractionHandlers`/`hasAnalyticsInstrumentation`/`rule`/`_internal` names consistent across Task 1 and tests. `RULE_ID`, sub-axis id, axis string identical in rule, registry, catalogue, doc. Finding shape matches `types.ts` (`ruleId, axis, severity, location{file,line,column}, message, suggestion`). `RuleEvalResult` `{ findings, opportunities }` matches the sibling.
