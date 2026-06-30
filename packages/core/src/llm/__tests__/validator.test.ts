import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateProposedFindings } from "../validator.js";
import type { ProposedFinding } from "../validator.js";

function makeRepoRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-validator-test-"));
  return dir;
}

describe("validateProposedFindings", () => {
  it("returns empty result for empty input", async () => {
    const repoRoot = makeRepoRoot();
    const result = await validateProposedFindings([], repoRoot);
    expect(result.findings).toEqual([]);
    expect(result.droppedHallucinations).toBe(0);
  });

  it("keeps finding when file exists and snippet appears", async () => {
    const repoRoot = makeRepoRoot();
    const srcDir = join(repoRoot, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "Button.tsx"), "export function Button() { return null; }");

    const proposed: ProposedFinding[] = [{
      ruleId: "ai-governance/ai-loading-error-states",
      axis: "ai-governance",
      severity: "warning",
      file: "src/Button.tsx",
      line: 1,
      column: 1,
      snippet: "export function Button()",
      message: "Missing AI error state",
    }];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("ai-governance/ai-loading-error-states");
    expect(result.droppedHallucinations).toBe(0);
  });

  it("attaches llmJudgement (verdict 'violation' + clamped confidence) when confidence is provided", async () => {
    const repoRoot = makeRepoRoot();
    const srcDir = join(repoRoot, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "Card.tsx"), "export function Card() { return null; }");

    const proposed: ProposedFinding[] = [
      {
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/Card.tsx",
        line: 1,
        column: 1,
        snippet: "export function Card()",
        message: "AI content without disclaimer",
        confidence: 0.83,
      },
      {
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/Card.tsx",
        line: 1,
        column: 1,
        snippet: "export function Card()",
        message: "Over-confident",
        confidence: 1.4,
      },
    ];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings).toHaveLength(2);
    const byMsg = Object.fromEntries(result.findings.map((f) => [f.message, f]));
    expect(byMsg["AI content without disclaimer"]!.llmJudgement).toEqual({
      verdict: "violation",
      confidence: 0.83,
    });
    expect(byMsg["Over-confident"]!.llmJudgement!.confidence).toBe(1); // clamped
  });

  it("omits llmJudgement when no confidence is provided", async () => {
    const repoRoot = makeRepoRoot();
    const srcDir = join(repoRoot, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "X.tsx"), "export const X = 1; // long enough snippet");

    const proposed: ProposedFinding[] = [{
      ruleId: "ai-governance/ai-loading-error-states",
      axis: "ai-governance",
      severity: "warning",
      file: "src/X.tsx",
      line: 1,
      column: 1,
      snippet: "export const X = 1;",
      message: "no confidence given",
    }];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.llmJudgement).toBeUndefined();
  });

  it("drops finding when file does not exist", async () => {
    const repoRoot = makeRepoRoot();
    const proposed: ProposedFinding[] = [{
      ruleId: "ai-governance/ai-loading-error-states",
      axis: "ai-governance",
      severity: "warning",
      file: "src/Nonexistent.tsx",
      line: 1,
      column: 1,
      snippet: "some code",
      message: "Missing error state",
    }];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings).toHaveLength(0);
    expect(result.droppedHallucinations).toBe(1);
  });

  it("drops finding when snippet not found in file", async () => {
    const repoRoot = makeRepoRoot();
    const srcDir = join(repoRoot, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "Real.tsx"), "export function Real() { return null; }");

    const proposed: ProposedFinding[] = [{
      ruleId: "ai-governance/ai-loading-error-states",
      axis: "ai-governance",
      severity: "warning",
      file: "src/Real.tsx",
      line: 1,
      column: 1,
      snippet: "this snippet does not exist in the file",
      message: "Missing error state",
    }];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings).toHaveLength(0);
    expect(result.droppedHallucinations).toBe(1);
  });

  it("counts multiple drops independently", async () => {
    const repoRoot = makeRepoRoot();
    const srcDir = join(repoRoot, "src");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "Real.tsx"), "export function Real() { return null; }");

    const proposed: ProposedFinding[] = [
      {
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/Real.tsx",
        line: 1,
        column: 1,
        snippet: "export function Real()",
        message: "ok",
      },
      {
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/Ghost.tsx",
        line: 1,
        column: 1,
        snippet: "phantom code",
        message: "hallucination 1",
      },
      {
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/Real.tsx",
        line: 1,
        column: 1,
        snippet: "wrong snippet here",
        message: "hallucination 2",
      },
    ];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings).toHaveLength(1);
    expect(result.droppedHallucinations).toBe(2);
  });

  it("converts validated ProposedFinding to proper Finding shape", async () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(join(repoRoot, "Foo.tsx"), "const x = 1;");

    const proposed: ProposedFinding[] = [{
      ruleId: "ai-governance/ai-marker-component-present",
      axis: "ai-governance",
      severity: "error",
      file: "Foo.tsx",
      line: 3,
      column: 5,
      snippet: "const x = 1;",
      message: "Missing marker",
      suggestion: "Add AiMarker component",
    }];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings[0]).toMatchObject({
      ruleId: "ai-governance/ai-marker-component-present",
      axis: "ai-governance",
      severity: "error",
      location: { file: "Foo.tsx", line: 3, column: 5 },
      message: "Missing marker",
      suggestion: "Add AiMarker component",
    });
  });

  it("drops finding with path traversal attempt", async () => {
    const repoRoot = makeRepoRoot();
    const outsideFile = join(tmpdir(), "secret.txt");
    writeFileSync(outsideFile, "SECRET_KEY=abc123");

    const proposed: ProposedFinding[] = [{
      ruleId: "ai-governance/ai-loading-error-states",
      axis: "ai-governance",
      severity: "warning",
      file: "../../secret.txt",
      line: 1,
      column: 1,
      snippet: "SECRET_KEY=abc123",
      message: "Traversal attempt",
    }];

    const result = await validateProposedFindings(proposed, repoRoot);
    expect(result.findings).toHaveLength(0);
    expect(result.droppedHallucinations).toBe(1);
  });
});
