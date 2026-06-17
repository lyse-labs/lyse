import { describe, it, expect } from "vitest";
import {
  rule,
  scanDeprecationMarkers,
} from "../../src/rules/versioning-deprecation-markers.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

function makeCtx(repoRoot = "/repo"): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}
function tsFile(path: string, source: string): ParsedTsFile {
  return { path, ast: null, source, imports: [] };
}
function parsed(...files: ParsedTsFile[]): ParsedFiles {
  return { ts: files, css: [], cssInJs: [] };
}

describe("scanDeprecationMarkers", () => {
  it("flags a bare @deprecated JSDoc tag (no migration guidance)", () => {
    const markers = scanDeprecationMarkers("/** @deprecated */\nexport const Old = () => null;");
    expect(markers).toHaveLength(1);
    expect(markers[0]!.hasGuidance).toBe(false);
  });

  it("treats a same-line description as guidance", () => {
    const markers = scanDeprecationMarkers("/** @deprecated Use `NewButton` instead. */\nexport const Old = 1;");
    expect(markers).toHaveLength(1);
    expect(markers[0]!.hasGuidance).toBe(true);
  });

  it("treats a wrapped (next-line) description as guidance", () => {
    const src = "/**\n * @deprecated\n * Use the new API surface instead.\n */\nexport const Old = 1;";
    const markers = scanDeprecationMarkers(src);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.hasGuidance).toBe(true);
  });

  it("treats a sibling @see tag as guidance", () => {
    const src = "/**\n * @deprecated\n * @see NewButton\n */\nexport const Old = 1;";
    const markers = scanDeprecationMarkers(src);
    expect(markers).toHaveLength(1);
    expect(markers[0]!.hasGuidance).toBe(true);
  });

  it("treats an inline {@link} as guidance", () => {
    const markers = scanDeprecationMarkers("/** @deprecated {@link NewButton} */\nexport const Old = 1;");
    expect(markers[0]!.hasGuidance).toBe(true);
  });

  it("does NOT count @deprecated mentioned in prose mid-sentence", () => {
    const markers = scanDeprecationMarkers("/** This replaces the @deprecated legacy helper. */\nexport const X = 1;");
    expect(markers).toHaveLength(0);
  });

  it("does NOT count @deprecated outside a block comment (e.g. in a string literal)", () => {
    const markers = scanDeprecationMarkers('const tag = "@deprecated";\n');
    expect(markers).toHaveLength(0);
  });

  it("counts each @deprecated tag as a separate opportunity", () => {
    const src =
      "/** @deprecated */\nexport const A = 1;\n/** @deprecated Use B. */\nexport const Old = 2;";
    const markers = scanDeprecationMarkers(src);
    expect(markers).toHaveLength(2);
    expect(markers.filter((m) => m.hasGuidance)).toHaveLength(1);
  });

  it("reports a 1-based line number for the tag", () => {
    const src = "const x = 1;\n\n/** @deprecated */\nexport const Old = 2;";
    const markers = scanDeprecationMarkers(src);
    expect(markers[0]!.line).toBe(3);
  });
});

describe("rule versioning/deprecation-markers", () => {
  it("emits a warning for a bare @deprecated tag", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(tsFile("/repo/src/Old.tsx", "/** @deprecated */\nexport const Old = () => null;")),
    );
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.axis).toBe("ai-surface");
    expect(f.ruleId).toBe("versioning/deprecation-markers");
    expect(result.opportunities).toBe(1);
  });

  it("emits no finding when every @deprecated tag carries guidance", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(tsFile("/repo/src/Old.tsx", "/** @deprecated Use `New` instead. */\nexport const Old = 1;")),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(1);
  });

  it("is N/A (opportunities 0) when the repo has no @deprecated tags", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(tsFile("/repo/src/Button.tsx", "export const Button = () => null;")),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("suppresses a finding when the comment carries the lyse-disable directive", async () => {
    const result = await rule.evaluate(
      makeCtx(),
      parsed(
        tsFile(
          "/repo/src/Old.tsx",
          "/** @deprecated lyse-disable versioning/deprecation-markers */\nexport const Old = 1;",
        ),
      ),
    );
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("returns no findings when there are no parsed files", async () => {
    const result = await rule.evaluate(makeCtx(), parsed());
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});
