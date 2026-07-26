import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseUnifiedDiff, walkTokenizationCommits } from "./walk.js";

function readFixture(name: string): string {
  return readFileSync(new URL(`../../../tests/reliability/gold/fixtures/${name}`, import.meta.url), "utf8");
}

const META = { repo: "test-repo", commit: "COMMIT_SHA", parent: "PARENT_SHA" };

describe("gold/walk parseUnifiedDiff", () => {
  it("positive-css-var.diff: 1 candidate, hex literal -> var()", () => {
    const candidates = parseUnifiedDiff(readFixture("positive-css-var.diff"), META);
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "src/navigation/underline-nav.scss",
        removedLiteral: "#f9826c",
        addedRef: "var(--color-underlinenav-border-active)",
        line: 42,
        parentLine: 43,
        massCodemod: false,
      },
    ]);
  });

  it("positive-css-var-2.diff: 1 candidate, unequal removed/added block lengths pair by property", () => {
    const candidates = parseUnifiedDiff(readFixture("positive-css-var-2.diff"), META);
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "polaris.shopify.com/src/components/Button/Button.module.scss",
        removedLiteral: "#008060",
        addedRef: "var(--primary)",
        line: 29,
        parentLine: 26,
        massCodemod: false,
      },
    ]);
  });

  it("positive-js-token.diff: 1 candidate, rename header + trailing-comment hex must not confuse addedRef", () => {
    const candidates = parseUnifiedDiff(readFixture("positive-js-token.diff"), META);
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "modules/labs-react/ai-assistant-ingress-button/lib/AIAssistantIngressButton.tsx",
        removedLiteral: "#FD7E00",
        addedRef: "base.orange400",
        line: 34,
        parentLine: 34,
        massCodemod: false,
      },
    ]);
  });

  it("negative-value-change.diff: walk still DETECTS the candidate (value-equality rejection is Task 5's job, not Task 4's)", () => {
    const candidates = parseUnifiedDiff(readFixture("negative-value-change.diff"), META);
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "src/base/normalize.scss",
        removedLiteral: "#ff0",
        addedRef: "var(--color-attention-subtle)",
        line: 164,
        parentLine: 164,
        massCodemod: false,
      },
    ]);
  });

  it("tangled-brand-refresh.diff: 10 candidates (5 value-preserving + 5 value-changing); import/interface-rename/focus-visible JSX produce none", () => {
    const candidates = parseUnifiedDiff(readFixture("tangled-brand-refresh.diff"), META);
    expect(candidates).toHaveLength(10);
    const byLine = new Map(candidates.map((c) => [c.line, c]));
    // parentLine == line for every pair here: both hunk blocks are balanced
    // (5 removed vs 5 added, then 5 vs 5) starting at old==new, so no insertion
    // shifts the old/new counters apart.
    const expectedPairs: Array<{ line: number; parentLine: number; literal: string; token: string }> = [
      { line: 22, parentLine: 22, literal: "#FFA198", token: "base.red200" },
      { line: 23, parentLine: 23, literal: "#FFCAA0", token: "base.orange200" },
      { line: 24, parentLine: 24, literal: "#FFCA79", token: "base.orange200" },
      { line: 25, parentLine: 25, literal: "#FDCA44", token: "base.amber200" },
      { line: 26, parentLine: 26, literal: "#FFB74D", token: "base.amber300" },
      { line: 31, parentLine: 31, literal: "#FFC2FD", token: "base.magenta200" },
      { line: 32, parentLine: 32, literal: "#FFF3A8", token: "base.amber100" },
      { line: 33, parentLine: 33, literal: "#FEC10B", token: "base.amber300" },
      { line: 34, parentLine: 34, literal: "#FD7E00", token: "base.orange400" },
      { line: 35, parentLine: 35, literal: "#FC5B05", token: "base.coral500" },
    ];
    for (const expected of expectedPairs) {
      const candidate = byLine.get(expected.line);
      expect(candidate).toBeDefined();
      expect(candidate?.removedLiteral).toBe(expected.literal);
      expect(candidate?.addedRef).toBe(expected.token);
      expect(candidate?.parentLine).toBe(expected.parentLine);
      expect(candidate?.file).toBe(
        "modules/labs-react/ai-assistant-ingress-button/lib/AIAssistantIngressButton.tsx",
      );
      expect(candidate?.massCodemod).toBe(false);
    }
  });

  it("tags massCodemod = true on every candidate when a single commit yields > 30 candidates", () => {
    const hunkLines: string[] = [];
    for (let n = 0; n < 31; n++) {
      hunkLines.push(`-const swatch${n} = '#${(100000 + n).toString(16).padStart(6, "0").slice(0, 6)}';`);
      hunkLines.push(`+const swatch${n} = tokens.swatch${n};`);
    }
    const synthetic = [
      "diff --git a/src/swatches.ts b/src/swatches.ts",
      "--- a/src/swatches.ts",
      "+++ b/src/swatches.ts",
      `@@ -1,${hunkLines.length / 2} +1,${hunkLines.length / 2} @@`,
      ...hunkLines,
    ].join("\n");
    const candidates = parseUnifiedDiff(synthetic, META);
    expect(candidates).toHaveLength(31);
    expect(candidates.every((c) => c.massCodemod === true)).toBe(true);
  });

  it("review round 1 / Fix 1: pairing is scoped to a replace-block, not the whole hunk — a pure-deletion same-key line elsewhere in the hunk must not steal a later, unrelated addition", () => {
    // Semantics implemented: positional (FIFO, i-th removed <-> i-th added)
    // pairing PER KEY, scoped to a contiguous replace-block (a maximal `-`
    // run immediately followed by a maximal `+` run). A `-` run with no
    // immediately-following `+` run (like `.a`'s lone removal below) is a
    // pure deletion and is flushed with zero candidates -- it can no longer
    // survive across a context-line gap to be wrongly consumed by a later,
    // unrelated `+` of the same key (the whole-hunk-FIFO bug).
    const diff = [
      "diff --git a/src/theme.css b/src/theme.css",
      "--- a/src/theme.css",
      "+++ b/src/theme.css",
      "@@ -1,10 +1,9 @@",
      " .a {",
      "-  color: #111111;",
      " }",
      " .b {",
      "-  color: #222222;",
      "-  color: #333333;",
      "+  color: var(--token-333);",
      "+  color: var(--token-222);",
      " }",
      " .c {",
      "-  color: #444444;",
      "+  color: var(--token-444);",
      " }",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);

    // `.a`'s pure deletion (#111111) yields nothing, and does not leak into
    // `.b`'s block. `.b`'s block has 2 removed + 2 added `color:` entries in
    // ONE replace-block -- a reordered same-key swap is indistinguishable
    // from an in-order replace from the diff text alone, so this case fails
    // closed (zero candidates for that key in that block) rather than risk
    // a coincidental-value-match silently corrupting a gold label. Only
    // `.c`'s unambiguous 1-removed/1-added block produces a candidate.
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "src/theme.css",
        removedLiteral: "#444444",
        addedRef: "var(--token-444)",
        line: 8,
        parentLine: 9,
        massCodemod: false,
      },
    ]);
  });

  it("review round 1 / Fix 2: stripTrailingComment does not truncate a url(https://...) value, so a colour -> url() replacement still yields a candidate", () => {
    const diff = [
      "diff --git a/src/button.css b/src/button.css",
      "--- a/src/button.css",
      "+++ b/src/button.css",
      "@@ -1 +1 @@",
      "-  background: #ff0000;",
      "+  background: url(https://cdn/x.png);",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);

    // Before the fix, `indexOf("//")` cut the added value at "url(https:"
    // (the `//` inside `https://`), which has no dotted-identifier or
    // var(--x) substring left to match TOKEN_REF_RE -- so the candidate was
    // silently dropped. After the fix the full value survives (the `//` is
    // inside `url(...)`'s parens, at depth > 0, so it's not treated as a
    // comment) and TOKEN_REF_RE's generic identifier.identifier fallback
    // matches "x.png" out of the URL -- not truncated, still a candidate.
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "src/button.css",
        removedLiteral: "#ff0000",
        addedRef: "x.png",
        line: 1,
        parentLine: 1,
        massCodemod: false,
      },
    ]);
  });

  it("review round 4 / Bug 1: a colour that lives ONLY in a trailing comment on the removed line yields no candidate (its real removed value is a function call, not a colour)", () => {
    // The `-` line's real value is `deriveColor()`; the hex only appears inside
    // a `//` comment. Without stripping the comment on the removed side, the
    // colour regex would read `#FD7E00` out of the comment and emit a candidate
    // with a fabricated removedLiteral. After the fix (stripTrailingComment on
    // the `-` side, mirroring the `+` side) the removed value carries no colour,
    // so no removed entry is recorded and the replace-block flushes empty.
    const diff = [
      "diff --git a/src/comp.tsx b/src/comp.tsx",
      "--- a/src/comp.tsx",
      "+++ b/src/comp.tsx",
      "@@ -1 +1 @@",
      "-const c = deriveColor(); // '#FD7E00'",
      "+const c = tok.x;",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);
    expect(candidates).toEqual([]);
  });

  it("review round 5: a colour that lives ONLY in a single-line block comment on the removed line yields no candidate (same vector as review round 4's `//` case, for `/* */`)", () => {
    // Mirrors the review-round-4 `//` regression, but the decoy hex is stashed
    // in a `/* ... */` block comment instead. Without stripping it, the colour
    // regex would read `#FD7E00` out of the comment and fabricate a candidate
    // for a removed line whose real value (`deriveColor()`) is not a colour.
    const diff = [
      "diff --git a/src/comp.tsx b/src/comp.tsx",
      "--- a/src/comp.tsx",
      "+++ b/src/comp.tsx",
      "@@ -1 +1 @@",
      "-const c = deriveColor(); /* was '#FD7E00' */",
      "+const c = tok.x;",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);
    expect(candidates).toEqual([]);
  });

  it("review round 6: a `//` inside a backtick template literal is not mis-stripped — a template-literal colour still yields a candidate (recall)", () => {
    // Without the backtick in stripTrailingComment's quote guard, the `//` in
    // `https://cdn/#FD7E00` reads as a comment start and truncates the value at
    // `https:`, dropping #FD7E00 -> candidate silently lost. With the guard the
    // template literal is treated as a quoted string, the `//` is ignored, and
    // the colour survives.
    const diff = [
      "diff --git a/src/comp.tsx b/src/comp.tsx",
      "--- a/src/comp.tsx",
      "+++ b/src/comp.tsx",
      "@@ -1 +1 @@",
      "-const bg = `https://cdn/#FD7E00`;",
      "+const bg = tokens.bg;",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "src/comp.tsx",
        removedLiteral: "#FD7E00",
        addedRef: "tokens.bg",
        line: 1,
        parentLine: 1,
        massCodemod: false,
      },
    ]);
  });

  it("review round 6: a `/* */` block comment inside a value collapses to a space — `#FD7E/* x */00` does not fuse into `#FD7E00`", () => {
    // If the block comment were dropped to the empty string, the two fragments
    // would reassemble into the full colour `#FD7E00`. Collapsing it to a single
    // space (block comments are whitespace) keeps them apart: the colour regex
    // reads only the leading `#FD7E`, never the fused value.
    const diff = [
      "diff --git a/src/comp.tsx b/src/comp.tsx",
      "--- a/src/comp.tsx",
      "+++ b/src/comp.tsx",
      "@@ -1 +1 @@",
      "-const c = #FD7E/* x */00;",
      "+const c = tok.x;",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.removedLiteral).toBe("#FD7E");
    expect(candidates[0]?.removedLiteral).not.toBe("#FD7E00");
  });

  it("review round 7 / Fix 1: two separate declarations fused onto one physical line yield ZERO candidates (fail closed, no cross-wire)", () => {
    // JS_DECL_RE's `.+$` swallows the whole line as one value blob. Without
    // the multi-declaration guard, the colour regex would read `glowHappyHour`'s
    // `#FD7E00` as if it belonged to `a`, and the token regex would read `a`'s
    // `someFn()`... except `someFn()` isn't a token match, so in THIS exact
    // repro the cross-wire would actually surface as `addedRef: base.someOther`
    // paired with `removedLiteral: #FD7E00` -- a wrong pairing (the real
    // relationship is `#FD7E00 -> base.orange400`). The fix must emit nothing
    // for this line rather than risk that silent mismatch.
    const diff = [
      "diff --git a/src/comp.tsx b/src/comp.tsx",
      "--- a/src/comp.tsx",
      "+++ b/src/comp.tsx",
      "@@ -1 +1 @@",
      "-const a = someFn(); const glowHappyHour = '#FD7E00';",
      "+const a = base.someOther; const glowHappyHour = base.orange400;",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);
    expect(candidates).toEqual([]);
  });

  it("review round 7 / Fix 1: a comma-separated multi-binding declaration yields ZERO candidates (ambiguous, same vector as two separate statements)", () => {
    // `const a = fn(), glowHappyHour = '#FD7E00';` is ONE statement with TWO
    // declarators sharing a `const`. The value after `a =` is
    // `fn(), glowHappyHour = '#FD7E00';` -- a top-level (depth-0) comma
    // separates the bindings, which is exactly as ambiguous as two full
    // statements: there is no way to tell from the value alone which
    // declarator a matched colour/token belongs to.
    const diff = [
      "diff --git a/src/comp.tsx b/src/comp.tsx",
      "--- a/src/comp.tsx",
      "+++ b/src/comp.tsx",
      "@@ -1 +1 @@",
      "-const a = fn(), glowHappyHour = '#FD7E00';",
      "+const a = base.x, glowHappyHour = base.orange400;",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);
    expect(candidates).toEqual([]);
  });

  it("review round 7 / Fix 1: a single declaration whose expression merely CONTAINS a comma/`=` still yields its normal candidate (guard must not over-trigger)", () => {
    // `fn(a, b)`'s comma sits inside the call's parens (depth > 0), and the
    // `||` operator is not a declaration keyword -- this is unambiguously ONE
    // declaration. The multi-declaration guard must leave it alone.
    const diff = [
      "diff --git a/src/comp.tsx b/src/comp.tsx",
      "--- a/src/comp.tsx",
      "+++ b/src/comp.tsx",
      "@@ -1 +1 @@",
      "-const x = fn(a, b) || '#FD7E00';",
      "+const x = fn(a, b) || tok.y;",
    ].join("\n");

    const candidates = parseUnifiedDiff(diff, META);
    expect(candidates).toEqual([
      {
        repo: "test-repo",
        commit: "COMMIT_SHA",
        parent: "PARENT_SHA",
        file: "src/comp.tsx",
        removedLiteral: "#FD7E00",
        addedRef: "tok.y",
        line: 1,
        parentLine: 1,
        massCodemod: false,
      },
    ]);
  });

  it("does not tag massCodemod when a commit yields exactly 30 or fewer candidates", () => {
    const hunkLines: string[] = [];
    for (let n = 0; n < 30; n++) {
      hunkLines.push(`-const swatch${n} = '#${(100000 + n).toString(16).padStart(6, "0").slice(0, 6)}';`);
      hunkLines.push(`+const swatch${n} = tokens.swatch${n};`);
    }
    const synthetic = [
      "diff --git a/src/swatches.ts b/src/swatches.ts",
      "--- a/src/swatches.ts",
      "+++ b/src/swatches.ts",
      `@@ -1,${hunkLines.length / 2} +1,${hunkLines.length / 2} @@`,
      ...hunkLines,
    ].join("\n");
    const candidates = parseUnifiedDiff(synthetic, META);
    expect(candidates).toHaveLength(30);
    expect(candidates.every((c) => c.massCodemod === false)).toBe(true);
  });
});

describe("gold/walk walkTokenizationCommits", () => {
  let repo: string;
  let secondCommit: string;
  let firstCommit: string;

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "gold-walk-"));
    const run = (args: string[]) => execFileSync("git", args, { cwd: repo });
    run(["init", "-q"]);
    run(["config", "user.email", "t@t"]);
    run(["config", "user.name", "t"]);
    writeFileSync(join(repo, "a.scss"), ".x {\n  color: #ff0000;\n}\n");
    run(["add", "."]);
    run(["commit", "-qm", "one"]);
    firstCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    writeFileSync(join(repo, "a.scss"), ".x {\n  color: var(--primary);\n}\n");
    run(["add", "."]);
    run(["commit", "-qm", "two"]);
    secondCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
  });

  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("walks first-parent history and parses each commit's diff into candidates", async () => {
    const candidates = await walkTokenizationCommits(repo, "synthetic-repo");
    expect(candidates).toEqual([
      {
        repo: "synthetic-repo",
        commit: secondCommit,
        parent: firstCommit,
        file: "a.scss",
        removedLiteral: "#ff0000",
        addedRef: "var(--primary)",
        line: 2,
        parentLine: 2,
        massCodemod: false,
      },
    ]);
  });
});
