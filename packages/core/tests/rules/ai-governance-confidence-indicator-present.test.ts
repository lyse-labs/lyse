import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  isConfidenceIndicatorName,
} from "../../src/rules/ai-governance-confidence-indicator-present.js";
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
  };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-confidence-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("isConfidenceIndicatorName", () => {
  it("matches confidence / uncertainty / certainty vocabulary", () => {
    expect(isConfidenceIndicatorName("ConfidenceBadge")).toBe(true);
    expect(isConfidenceIndicatorName("ConfidenceScore")).toBe(true);
    expect(isConfidenceIndicatorName("UncertaintyIndicator")).toBe(true);
    expect(isConfidenceIndicatorName("CertaintyMeter")).toBe(true);
  });

  it("matches kebab/snake names after normalisation", () => {
    expect(isConfidenceIndicatorName("confidence-level")).toBe(true);
    expect(isConfidenceIndicatorName("uncertainty_badge")).toBe(true);
  });

  it("does NOT match unrelated names", () => {
    expect(isConfidenceIndicatorName("Button")).toBe(false);
    expect(isConfidenceIndicatorName("AILabel")).toBe(false);
    expect(isConfidenceIndicatorName("ScoreCard")).toBe(false);
  });
});

describe("rule ai-governance/confidence-indicator-present", () => {
  it("emits info when a confidence indicator is co-located with an AI marker in the same file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AiAnswer.tsx"),
      ["export const AILabel = () => null;", "export const ConfidenceBadge = () => null;"].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("info");
    expect(f.axis).toBe("ai-governance");
    expect(f.ruleId).toBe("ai-governance/confidence-indicator-present");
    expect(f.message).toContain("ConfidenceBadge");
  });

  it("emits warning when an AI marker exists but no confidence indicator is found", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
    expect(result.findings[0]!.message).toContain("confidence");
  });

  it("does NOT earn credit for a confidence component in a file with no AI marker → warning", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(
      join(tmp, "src", "components", "ConfidenceInterval.tsx"),
      "export const ConfidenceInterval = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("emits no finding when no AI marker is present anywhere", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "ConfidenceBadge.tsx"),
      "export const ConfidenceBadge = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("returns no findings when repoRoot is not set", async () => {
    const result = await rule.evaluate(makeCtx(""), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("emits no finding when README.md contains the lyse-disable directive", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(
      join(tmp, "README.md"),
      "# DS\n\n<!-- lyse-disable ai-governance/confidence-indicator-present -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });
});
