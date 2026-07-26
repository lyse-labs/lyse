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
        massCodemod: false,
      },
    ]);
  });

  it("tangled-brand-refresh.diff: 10 candidates (5 value-preserving + 5 value-changing); import/interface-rename/focus-visible JSX produce none", () => {
    const candidates = parseUnifiedDiff(readFixture("tangled-brand-refresh.diff"), META);
    expect(candidates).toHaveLength(10);
    const byLine = new Map(candidates.map((c) => [c.line, c]));
    const expectedPairs: Array<{ line: number; literal: string; token: string }> = [
      { line: 22, literal: "#FFA198", token: "base.red200" },
      { line: 23, literal: "#FFCAA0", token: "base.orange200" },
      { line: 24, literal: "#FFCA79", token: "base.orange200" },
      { line: 25, literal: "#FDCA44", token: "base.amber200" },
      { line: 26, literal: "#FFB74D", token: "base.amber300" },
      { line: 31, literal: "#FFC2FD", token: "base.magenta200" },
      { line: 32, literal: "#FFF3A8", token: "base.amber100" },
      { line: 33, literal: "#FEC10B", token: "base.amber300" },
      { line: 34, literal: "#FD7E00", token: "base.orange400" },
      { line: 35, literal: "#FC5B05", token: "base.coral500" },
    ];
    for (const expected of expectedPairs) {
      const candidate = byLine.get(expected.line);
      expect(candidate).toBeDefined();
      expect(candidate?.removedLiteral).toBe(expected.literal);
      expect(candidate?.addedRef).toBe(expected.token);
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
        massCodemod: false,
      },
    ]);
  });
});
