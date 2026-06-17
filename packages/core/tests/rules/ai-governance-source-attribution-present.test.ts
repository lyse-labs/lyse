import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  isSourceAttributionName,
} from "../../src/rules/ai-governance-source-attribution-present.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-attribution-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("isSourceAttributionName", () => {
  it("matches citation / attribution / provenance vocabulary", () => {
    expect(isSourceAttributionName("Citations")).toBe(true);
    expect(isSourceAttributionName("SourceCitation")).toBe(true);
    expect(isSourceAttributionName("SourceAttribution")).toBe(true);
    expect(isSourceAttributionName("ProvenancePanel")).toBe(true);
  });
  it("does NOT match the bare generic source/reference primitives", () => {
    expect(isSourceAttributionName("SourceCode")).toBe(false);
    expect(isSourceAttributionName("ReferenceDocs")).toBe(false);
    expect(isSourceAttributionName("Button")).toBe(false);
  });
});

describe("rule ai-governance/source-attribution-present", () => {
  it("emits info when an attribution component is co-located with an AI marker", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AiAnswer.tsx"),
      ["export const AILabel = () => null;", "export const Citations = () => null;"].join("\n"),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("Citations");
  });

  it("emits warning when an AI marker exists but no attribution component is found", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("does NOT earn credit for an attribution component in a file with no AI marker → warning", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(join(tmp, "src", "components", "Bibliography.tsx"), "export const Citation = () => null;");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("warning");
  });

  it("emits no finding when no AI marker is present anywhere", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "Citations.tsx"), "export const Citations = () => null;");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("emits no finding when README.md contains the lyse-disable directive", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(join(tmp, "src", "components", "AILabel.tsx"), "export const AILabel = () => null;");
    writeFileSync(join(tmp, "README.md"), "<!-- lyse-disable ai-governance/source-attribution-present -->\n");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });
});
