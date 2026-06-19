# wrap-ai-token codemod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `lyse fix` codemod that resolves `ai-governance/ai-token-requires-marker` by inserting a `data-ai` attribute on the single-line JSX opening tag of the element using a reserved AI token — high-confidence only, NO_FIX when ambiguous.

**Architecture:** The rule's finding is file-level, so the codemod re-locates the reserved-token reference (reusing a new `reservedTokenRefOffsets` helper exported from the rule), finds the enclosing single-line opening tag, and emits a `singleLineDiff` inserting ` data-ai` after the tag name. Wired into the `applyCodemod` switch. Mirrors `shadow-native.ts`.

**Tech Stack:** TypeScript (strict, NodeNext `.js` specifiers), vitest. Regex/line-based string mutation (no AST), like the existing codemods.

## Global Constraints

- Codemod fixes only `ai-governance/ai-token-requires-marker`. `data-ai` is the rule's sanctioned fix and is recognised by its `DATA_AI_ATTR_RE` (`/\bdata-ai(?:-[a-z][a-z0-9-]*)?\b/`), so the fix genuinely clears the finding.
- **High-confidence only.** Emit a patch (confidence `0.85`) ONLY when: exactly ONE reserved-token reference in the file AND a single-line enclosing JSX opening tag is locatable AND that tag has no existing `data-ai*`. Every other case returns NO_FIX (`patch: null, confidence: 0`). Never guess placement; never mutate structurally.
- Reserved-token references counted = `var(--<reserved>)` and bare `--<reserved>` only (the rule's HIGH-confidence forms). Dot-path heuristic refs are NOT counted (the rule itself treats them as low-confidence).
- `CodemodResult` shape (from `codemods/index.ts`): `{ patch: string | null, confidence: number, alternatives: [], rationale: string | null, rule_id: string, schema_version: "1.0.0" }`. `CodemodInput` = `{ source, path, finding, ctx }`.
- No new dependency. No change to the rule's `evaluate`/`classifyConfidence`. Strict TS, NodeNext `.js` specifiers, no comments unless WHY is non-obvious.
- Run tests: `cd packages/core && pnpm vitest run tests/codemods/ai-token-requires-marker.test.ts` and `tests/rules/ai-governance-ai-token-requires-marker.test.ts`.

---

## File Structure

- Modify `packages/core/src/rules/ai-governance-ai-token-requires-marker.ts` — add an exported `reservedTokenRefOffsets(source): number[]` helper (reuses the rule's existing reserved-token regexes + `isReservedTokenName`).
- Create `packages/core/src/codemods/ai-token-requires-marker.ts` — `fixWrapAiToken(input)` + `findEnclosingOpeningTag` helper.
- Modify `packages/core/src/codemods/index.ts` — add the `case` to the `applyCodemod` switch.
- Test `packages/core/tests/rules/ai-governance-ai-token-requires-marker.test.ts` — add offsets-helper tests.
- Create `packages/core/tests/codemods/ai-token-requires-marker.test.ts` — codemod tests.
- Modify `CHANGELOG.md`.

---

### Task 1: Export `reservedTokenRefOffsets` from the rule

**Files:**
- Modify: `packages/core/src/rules/ai-governance-ai-token-requires-marker.ts`
- Test: `packages/core/tests/rules/ai-governance-ai-token-requires-marker.test.ts`

**Interfaces:**
- Consumes: the rule's existing `CSS_VAR_RE`, `BARE_CSS_TOKEN_RE`, `isReservedTokenName` (already in the file).
- Produces: `export function reservedTokenRefOffsets(source: string): number[]` — sorted unique source offsets of HIGH-confidence reserved-token references (`var(--reserved)` and bare `--reserved`).

- [ ] **Step 1: Write the failing test**

```typescript
import { reservedTokenRefOffsets } from "../../src/rules/ai-governance-ai-token-requires-marker.js";

describe("reservedTokenRefOffsets", () => {
  it("returns the offset of a single var(--ai-*) reference", () => {
    const src = `const C = () => <div style={{ background: "var(--ai-surface)" }} />;`;
    const offs = reservedTokenRefOffsets(src);
    expect(offs).toHaveLength(1);
    expect(src.slice(offs[0]!, offs[0]! + 14)).toContain("var(--ai-surface");
  });
  it("returns two offsets for two distinct reserved references", () => {
    const src = `<div style={{ color: "var(--ai-fg)", background: "var(--ai-bg)" }} />`;
    expect(reservedTokenRefOffsets(src).length).toBe(2);
  });
  it("ignores non-reserved tokens", () => {
    expect(reservedTokenRefOffsets(`<div style={{ color: "var(--color-fg)" }} />`)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && pnpm vitest run tests/rules/ai-governance-ai-token-requires-marker.test.ts -t reservedTokenRefOffsets`
Expected: FAIL — `reservedTokenRefOffsets` is not exported.

- [ ] **Step 3: Implement the helper**

Add to `ai-governance-ai-token-requires-marker.ts` (near the other reserved-token logic). It MUST reuse the file's existing `CSS_VAR_RE`, `BARE_CSS_TOKEN_RE`, and `isReservedTokenName` — do not introduce new patterns. The two `var(...)`/bare forms are the rule's HIGH-confidence references (the dot-path `DOT_TOKEN_RE` is intentionally excluded — the rule treats it as low-confidence).

```typescript
/**
 * Source offsets of the HIGH-confidence reserved-token references the rule
 * keys on (`var(--reserved)` and bare `--reserved`). Used by the wrap-ai-token
 * codemod to locate the element to annotate. The dot-path heuristic is excluded
 * (low-confidence, never auto-fixed). Offsets are unique and ascending.
 */
export function reservedTokenRefOffsets(source: string): number[] {
  const offsets = new Set<number>();
  CSS_VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CSS_VAR_RE.exec(source)) !== null) {
    if (m[1] && isReservedTokenName(m[1])) offsets.add(m.index);
  }
  BARE_CSS_TOKEN_RE.lastIndex = 0;
  while ((m = BARE_CSS_TOKEN_RE.exec(source)) !== null) {
    if (m[1] && isReservedTokenName(m[1])) offsets.add(m.index);
  }
  return [...offsets].sort((a, b) => a - b);
}
```

> If `CSS_VAR_RE`/`BARE_CSS_TOKEN_RE`/`isReservedTokenName` are not at module scope in the file, read the file and use the actual identifiers (the rule defines these regexes near the top and `isReservedTokenName` as a helper — confirmed present). Do not duplicate the patterns.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && pnpm vitest run tests/rules/ai-governance-ai-token-requires-marker.test.ts`
Expected: PASS (new + existing rule tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rules/ai-governance-ai-token-requires-marker.ts packages/core/tests/rules/ai-governance-ai-token-requires-marker.test.ts
git commit -m "feat(rules): export reservedTokenRefOffsets for the wrap-ai-token codemod (#92)"
```

---

### Task 2: The wrap-ai-token codemod + wiring + CHANGELOG

**Files:**
- Create: `packages/core/src/codemods/ai-token-requires-marker.ts`
- Modify: `packages/core/src/codemods/index.ts`
- Test: `packages/core/tests/codemods/ai-token-requires-marker.test.ts`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: `CodemodInput`, `CodemodResult` (from `./index.js`); `singleLineDiff` (from `./diff.js`); `reservedTokenRefOffsets` (Task 1).
- Produces: `fixWrapAiToken(input: CodemodInput): CodemodResult`.

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { fixWrapAiToken } from "../../src/codemods/ai-token-requires-marker.js";
import type { CodemodInput } from "../../src/codemods/index.js";

function makeInput(source: string): CodemodInput {
  return {
    source,
    path: "src/AnswerCard.tsx",
    finding: {
      ruleId: "ai-governance/ai-token-requires-marker",
      axis: "ai-governance",
      severity: "error",
      location: { file: "src/AnswerCard.tsx", line: 1, column: 1 },
      message: "Component uses reserved AI token(s) but renders no AI-marker",
    },
    ctx: { tokens: { colors: new Map(), spacing: new Map() }, components: new Set(), config: {} },
  } as unknown as CodemodInput;
}

describe("fixWrapAiToken", () => {
  it("inserts data-ai on the single-line opening tag of a single reserved-token element (high confidence)", () => {
    const src = `export const C = () => <div style={{ background: "var(--ai-surface)" }}>{a}</div>;`;
    const res = fixWrapAiToken(makeInput(src));
    expect(res.confidence).toBeGreaterThanOrEqual(0.8);
    expect(res.patch).toContain("<div data-ai style=");
  });
  it("NO_FIX when two reserved-token references (ambiguous)", () => {
    const src = `<div style={{ color: "var(--ai-fg)", background: "var(--ai-bg)" }} />`;
    const res = fixWrapAiToken(makeInput(src));
    expect(res.patch).toBeNull();
    expect(res.confidence).toBe(0);
  });
  it("NO_FIX (idempotent) when the tag already has data-ai", () => {
    const src = `<div data-ai style={{ background: "var(--ai-surface)" }} />`;
    expect(fixWrapAiToken(makeInput(src)).patch).toBeNull();
  });
  it("NO_FIX when the reserved token is not inside a single-line opening tag", () => {
    const src = "const x = `var(--ai-surface)`;\nexport const C = () => <div>{x}</div>;";
    expect(fixWrapAiToken(makeInput(src)).patch).toBeNull();
  });
  it("NO_FIX when no reserved token is present", () => {
    expect(fixWrapAiToken(makeInput(`<div style={{ color: "var(--color-fg)" }} />`)).patch).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && pnpm vitest run tests/codemods/ai-token-requires-marker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the codemod**

```typescript
import type { CodemodInput, CodemodResult } from "./index.js";
import { singleLineDiff } from "./diff.js";
import { reservedTokenRefOffsets } from "../rules/ai-governance-ai-token-requires-marker.js";

const RULE_ID = "ai-governance/ai-token-requires-marker";
const DATA_AI_RE = /\bdata-ai(?:-[a-z][a-z0-9-]*)?\b/;
const OPEN_TAG_RE = /<([A-Za-z][A-Za-z0-9_.-]*)/g;

function noFix(rationale: string): CodemodResult {
  return { patch: null, confidence: 0, alternatives: [], rationale, rule_id: RULE_ID, schema_version: "1.0.0" };
}

/**
 * Locate the single-line JSX opening tag that encloses the reserved-token
 * reference at `refIndex`. Returns the 1-based line, the line text, and the
 * column just after the tag name (where ` data-ai` is inserted). Null when the
 * reference is not inside a single-line opening tag (the ambiguous/structural
 * cases we refuse).
 */
function findEnclosingOpeningTag(
  source: string,
  refIndex: number,
): { line: number; lineText: string; tagNameEnd: number } | null {
  const lineStart = source.lastIndexOf("\n", refIndex - 1) + 1;
  const lineEndRaw = source.indexOf("\n", refIndex);
  const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;
  const lineText = source.slice(lineStart, lineEnd);
  const refCol = refIndex - lineStart;

  let best: { tagNameEnd: number; open: number } | null = null;
  OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_TAG_RE.exec(lineText)) !== null) {
    const open = m.index;
    if (open >= refCol) break;
    const close = lineText.indexOf(">", open);
    if (close === -1 || close < refCol) continue; // tag must enclose the ref on this line
    best = { tagNameEnd: open + m[0].length, open };
  }
  if (!best) return null;

  const line = source.slice(0, lineStart).split("\n").length;
  return { line, lineText, tagNameEnd: best.tagNameEnd };
}

export function fixWrapAiToken(input: CodemodInput): CodemodResult {
  const { source, path } = input;

  const offsets = reservedTokenRefOffsets(source);
  if (offsets.length === 0) return noFix("No reserved AI-token reference found.");
  if (offsets.length > 1) {
    return noFix("Multiple reserved AI-token references — ambiguous which element to annotate.");
  }

  const tag = findEnclosingOpeningTag(source, offsets[0]!);
  if (!tag) {
    return noFix("Reserved token is not inside a single-line JSX opening tag — manual annotation required.");
  }
  if (DATA_AI_RE.test(tag.lineText)) return noFix("Element already carries a data-ai attribute.");

  const newLine = `${tag.lineText.slice(0, tag.tagNameEnd)} data-ai${tag.lineText.slice(tag.tagNameEnd)}`;
  const patch = singleLineDiff(path, source, tag.line, tag.lineText, newLine);

  return { patch, confidence: 0.85, alternatives: [], rationale: null, rule_id: RULE_ID, schema_version: "1.0.0" };
}
```

- [ ] **Step 4: Wire into the dispatch switch**

In `packages/core/src/codemods/index.ts`: add the import and the case (alongside `fixShadowNative`).

```typescript
import { fixWrapAiToken } from "./ai-token-requires-marker.js";
```

Add inside the `applyCodemod` switch (with the other direct cases):

```typescript
    case "ai-governance/ai-token-requires-marker":
      return fixWrapAiToken(input);
```

- [ ] **Step 5: Run the codemod tests**

Run: `cd packages/core && pnpm vitest run tests/codemods/ai-token-requires-marker.test.ts`
Expected: PASS (5/5).

> If the generated patch fails to apply, sanity-check with the `diff-applies` helper convention in `tests/codemods/diff-applies.test.ts` (it `git apply`s a patch to confirm it is well-formed). Add one such applies-cleanly assertion if that test file exposes a reusable helper; otherwise the `singleLineDiff` builder (shared with shadow-native) already guarantees a valid single-hunk patch.

- [ ] **Step 6: CHANGELOG**

Under `## [Unreleased]` → `### Added`:

```markdown
- `lyse fix` codemod for `ai-governance/ai-token-requires-marker`: inserts a `data-ai` attribute on the AI-token-using element (high-confidence, deterministic single-element case only; behind the 6 safety guards) (lyse-labs/lyse-internal#92).
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/codemods/ai-token-requires-marker.ts packages/core/src/codemods/index.ts packages/core/tests/codemods/ai-token-requires-marker.test.ts CHANGELOG.md
git commit -m "feat(fix): wrap-ai-token codemod — annotate AI-token element with data-ai (#92)"
```

---

## Self-Review

**1. Spec coverage:**
- data-ai insertion on single-line opening tag, high-confidence → Task 2 `fixWrapAiToken` + `findEnclosingOpeningTag`. ✓
- Re-locate token (file-level finding) via reused detection → Task 1 `reservedTokenRefOffsets`. ✓
- NO_FIX on: 0 refs / >1 ref / no single-line tag / existing data-ai → Task 2 tests + guards. ✓
- Recognised-fix correctness (data-ai clears the rule) → constraint documented; `DATA_AI_RE` matches the rule's `DATA_AI_ATTR_RE`. ✓
- Wiring into applyCodemod switch → Task 2 Step 4. ✓
- disclaimer/feedback-insert NOT built (scaffold-covered) → no task; recorded in commit/PR + CHANGELOG scope. ✓
- Behind 6 guards / high-confidence (0.85 → "high" via adaptOldCodemodResult ≥0.8) → confidence value. ✓

**2. Placeholder scan:** No TBD/TODO; complete code in every code step. The two `>`-quoted notes are verify-against-source fallbacks, not placeholders.

**3. Type consistency:** `fixWrapAiToken`, `findEnclosingOpeningTag`, `reservedTokenRefOffsets`, `noFix` names consistent across tasks/tests. `CodemodResult` fields (`patch, confidence, alternatives, rationale, rule_id, schema_version`) match `shadow-native.ts`/`index.ts`. `singleLineDiff(path, source, line, oldLine, newLine)` matches `diff.ts`. RULE_ID + `DATA_AI_RE` mirror the rule's `DATA_AI_ATTR_RE`.
