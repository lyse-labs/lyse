import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  isExplainabilityAffordanceName,
  isMarkerWithPopover,
  scanForExplainabilityAffordances,
} from "../../src/rules/ai-governance-explainability-affordance.js";
import { scanForMarkerComponents } from "../../src/rules/ai-governance-ai-marker-component-present.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

function scanForAiMarkers(repoRoot: string): boolean {
  return scanForMarkerComponents(repoRoot).length > 0;
}

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
  tmp = mkdtempSync(join(tmpdir(), "lyse-explainability-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Unit: isExplainabilityAffordanceName
// ---------------------------------------------------------------------------
describe("isExplainabilityAffordanceName", () => {
  it("matches Explain* names", () => {
    expect(isExplainabilityAffordanceName("ExplainPopover")).toBe(true);
    expect(isExplainabilityAffordanceName("Explainability")).toBe(true);
    expect(isExplainabilityAffordanceName("explain-panel")).toBe(true);
  });

  it("matches WhyThis", () => {
    expect(isExplainabilityAffordanceName("WhyThisResult")).toBe(true);
    expect(isExplainabilityAffordanceName("whythis")).toBe(true);
  });

  it("matches Citation and Sources", () => {
    expect(isExplainabilityAffordanceName("CitationList")).toBe(true);
    expect(isExplainabilityAffordanceName("SourcesPanel")).toBe(true);
  });

  it("matches Confidence and Provenance", () => {
    expect(isExplainabilityAffordanceName("ConfidenceDisplay")).toBe(true);
    expect(isExplainabilityAffordanceName("ProvenanceInfo")).toBe(true);
  });

  it("does NOT match unrelated component names", () => {
    expect(isExplainabilityAffordanceName("Button")).toBe(false);
    expect(isExplainabilityAffordanceName("AILabel")).toBe(false);
    expect(isExplainabilityAffordanceName("Card")).toBe(false);
    expect(isExplainabilityAffordanceName("Dialog")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: isMarkerWithPopover
// ---------------------------------------------------------------------------
describe("isMarkerWithPopover", () => {
  it("returns true for AI-marker name with aria-describedby in source", () => {
    const src = `export function AILabel() {
  return <button aria-describedby="why-panel">AI</button>;
}`;
    expect(isMarkerWithPopover("AILabel", src)).toBe(true);
  });

  it("returns true for AI-marker name with role=dialog in source", () => {
    const src = `export function AIBadge() {
  return <div><span>AI</span><div role="dialog">Explanation</div></div>;
}`;
    expect(isMarkerWithPopover("AIBadge", src)).toBe(true);
  });

  it("returns true for AI-marker name with role=tooltip in source", () => {
    const src = `export const AITag = () => (
  <span><label>AI</label><div role="tooltip">Why AI generated this</div></span>
);`;
    expect(isMarkerWithPopover("AITag", src)).toBe(true);
  });

  it("returns false for non-marker name even with aria-describedby", () => {
    const src = `export function Button() {
  return <button aria-describedby="help">Click</button>;
}`;
    expect(isMarkerWithPopover("Button", src)).toBe(false);
  });

  it("returns false for AI-marker name without popover ARIA attributes", () => {
    const src = `export function AILabel() {
  return <span className="ai-badge">AI</span>;
}`;
    expect(isMarkerWithPopover("AILabel", src)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: scanForAiMarkers
// ---------------------------------------------------------------------------
describe("scanForAiMarkers", () => {
  it("returns false when no AI-marker components present", () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { Button } from './button';\nexport { Card } from './card';",
    );
    expect(scanForAiMarkers(tmp)).toBe(false);
  });

  it("returns true when AILabel is exported from src/index.ts", () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { AILabel } from './ai-label';\nexport { Button } from './button';",
    );
    expect(scanForAiMarkers(tmp)).toBe(true);
  });

  it("returns true when AIBadge component file is present", () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIBadge.tsx"),
      "export const AIBadge = () => null;",
    );
    expect(scanForAiMarkers(tmp)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: rule.evaluate
// ---------------------------------------------------------------------------
describe("rule ai-governance/explainability-affordance", () => {
  // Fixture 1: ExplainPopover co-located with AI-marker in same file → info
  it("emits info when ExplainPopover is co-located with an AI-marker component in the same file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      [
        "export function AILabel() { return null; }",
        "export function ExplainPopover() { return null; }",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("info");
    expect(f.axis).toBe("ai-governance");
    expect(f.ruleId).toBe("ai-governance/explainability-affordance");
    expect(f.message).toContain("ExplainPopover");
    expect(f.message).toContain("HAX G11");
  });

  // Fixture 2 (regression): CitationList in a SEPARATE file from AI-marker → warning
  // Generic affordance-named component with no AI marker in its own file earns no credit.
  it("emits warning when CitationList is in a separate file from the AI-marker (no co-location)", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIBadge.tsx"),
      "export const AIBadge = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "CitationList.tsx"),
      "export const CitationList = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
    expect(result.findings[0]!.message).toContain("no explainability affordance");
  });

  // Fixture 3: ConfidenceDisplay co-located with AI-marker → info
  it("emits info when ConfidenceDisplay is co-located with AI-marker in the same file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      [
        "export function AILabel() { return null; }",
        "export function ConfidenceDisplay() { return null; }",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("ConfidenceDisplay");
  });

  // Fixture 4: AI-marker with aria-describedby popover → info
  it("emits info when AI-marker component source includes aria-describedby", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      [
        "export function AILabel() {",
        '  return <button aria-describedby="explain-panel">AI</button>;',
        "}",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("HAX G11");
  });

  // Fixture 5: AI-marker present but no explainability affordance → warning
  it("emits warning when AI-marker exists but no explainability affordance is found", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      [
        "export { AILabel } from './ai-label';",
        "export { Button } from './button';",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.ruleId).toBe("ai-governance/explainability-affordance");
    expect(f.message).toContain("HAX G11");
    expect(f.message).toContain("no explainability affordance");
  });

  // Fixture 6: No AI-marker at all → no finding
  it("emits no finding when no AI-marker component is present", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { Button } from './button';\nexport { Card } from './card';",
    );
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { primary: "#0070f3" } }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 7: repoRoot not set → no finding
  it("returns no findings when repoRoot is not set", async () => {
    const ctx: RuleContext = {
      repoRoot: "",
      tokens: null,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: [],
    };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 8 (regression): WhyThisResult in a SEPARATE file from AI-marker → warning
  it("emits warning when WhyThisResult is in a separate file from the GenAI marker (no co-location)", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "GenAIAvatar.tsx"),
      "export const GenAIAvatar = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "WhyThisResult.tsx"),
      "export const WhyThisResult = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
    expect(result.findings[0]!.message).toContain("no explainability affordance");
  });

  // Fixture 9 (co-location pass): WhyThisResult co-located with GenAI marker → info
  it("emits info when WhyThisResult is co-located with GenAI marker in the same file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "GenAIAvatar.tsx"),
      [
        "export const GenAIAvatar = () => null;",
        "export const WhyThisResult = () => null;",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("WhyThisResult");
  });
});

// ---------------------------------------------------------------------------
// Unit: scanForExplainabilityAffordances (co-location semantics)
// ---------------------------------------------------------------------------
describe("scanForExplainabilityAffordances — co-location", () => {
  it("returns empty when affordance file has no AI marker in it", () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "ConfidenceDisplay.tsx"),
      "export const ConfidenceDisplay = () => null;",
    );
    expect(scanForExplainabilityAffordances(tmp)).toEqual([]);
  });

  it("returns affordance name when co-located with AI marker", () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      [
        "export const AILabel = () => null;",
        "export const ConfidenceDisplay = () => null;",
      ].join("\n"),
    );
    const result = scanForExplainabilityAffordances(tmp);
    expect(result).toContain("ConfidenceDisplay");
  });
});

// ---------------------------------------------------------------------------
// AI co-location regression — generic affordance-named component in non-AI file
// ---------------------------------------------------------------------------
describe("AI co-location — affordance in non-AI file earns no credit", () => {
  // Core regression: AILabel.tsx (marker) + ConfidenceDisplay.tsx (generic, no marker) → warning
  it("emits warning when ConfidenceDisplay.tsx has no AI marker in its file (false positive blocked)", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "ConfidenceDisplay.tsx"),
      "export const ConfidenceDisplay = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
    expect(result.findings[0]!.message).toContain("no explainability affordance");
  });

  // Passes when ConfidenceDisplay is co-located with AI marker → info
  it("emits info when ConfidenceDisplay is co-located with AILabel in the same file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AILabel.tsx"),
      [
        "export const AILabel = () => null;",
        "export const ConfidenceDisplay = () => null;",
      ].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("ConfidenceDisplay");
  });

  // SourcesPanel in a non-AI file (e.g. search results panel) → no credit
  it("emits warning when SourcesPanel.tsx has no AI marker in its file", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIBadge.tsx"),
      "export const AIBadge = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "components", "SourcesPanel.tsx"),
      "export const SourcesPanel = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// Fix 1: allowlist suppression
// ---------------------------------------------------------------------------
describe("allowlist — lyse-disable directive", () => {
  it("emits no finding when README.md contains the lyse-disable directive", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      [
        "export { AILabel } from './ai-label';",
        "export { Button } from './button';",
      ].join("\n"),
    );
    writeFileSync(
      join(tmp, "README.md"),
      "# My DS\n\n<!-- lyse-disable ai-governance/explainability-affordance -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fix 2: .ts utility files do NOT produce findings (glob narrowed to tsx/jsx/vue)
// ---------------------------------------------------------------------------
describe("glob narrowing — .ts utility files excluded", () => {
  it("does NOT produce a finding for a DataSources.ts utility file", async () => {
    mkdirSync(join(tmp, "src", "utils"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "utils", "DataSources.ts"),
      "export function fetchDataSources() { return []; }",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("does NOT produce a finding for a sources.ts utility file even with an AI-marker present", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    mkdirSync(join(tmp, "src", "utils"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIBadge.tsx"),
      "export const AIBadge = () => null;",
    );
    writeFileSync(
      join(tmp, "src", "utils", "sources.ts"),
      "export function getSources() { return []; }",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
    expect(result.findings[0]!.message).not.toContain("sources");
  });
});
