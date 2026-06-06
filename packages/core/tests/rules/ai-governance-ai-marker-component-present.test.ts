import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  AI_MARKER_NAMES,
  isAiMarkerName,
  scanForMarkerComponents,
  extractNamesFromSource,
} from "../../src/rules/ai-governance-ai-marker-component-present.js";
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
  tmp = mkdtempSync(join(tmpdir(), "lyse-ai-marker-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Unit: isAiMarkerName
// ---------------------------------------------------------------------------
describe("isAiMarkerName", () => {
  it("matches canonical names from AI_MARKER_NAMES set (case-insensitive)", () => {
    for (const name of AI_MARKER_NAMES) {
      expect(isAiMarkerName(name)).toBe(true);
      expect(isAiMarkerName(name.toUpperCase())).toBe(true);
    }
  });

  it("matches Polaris magic-* prefix", () => {
    expect(isAiMarkerName("magic-icon")).toBe(true);
    expect(isAiMarkerName("magic-sparkle")).toBe(true);
  });

  it("matches GenAI* prefix", () => {
    expect(isAiMarkerName("GenAIOutput")).toBe(true);
    expect(isAiMarkerName("genaioutput")).toBe(true);
  });

  it("matches *AIMarker* substring", () => {
    expect(isAiMarkerName("MyAIMarkerBadge")).toBe(true);
  });

  it("does NOT match generic component names that happen to contain letters a-i", () => {
    expect(isAiMarkerName("Button")).toBe(false);
    expect(isAiMarkerName("MainContent")).toBe(false);
    expect(isAiMarkerName("RailNav")).toBe(false);
    expect(isAiMarkerName("CaptionText")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: extractNamesFromSource
// ---------------------------------------------------------------------------
describe("extractNamesFromSource", () => {
  it("extracts named function exports", () => {
    const src = "export function AILabel() { return null; }";
    expect(extractNamesFromSource(src)).toContain("AILabel");
  });

  it("extracts named const exports", () => {
    const src = "export const AIBadge = () => null;";
    expect(extractNamesFromSource(src)).toContain("AIBadge");
  });

  it("extracts names from export blocks", () => {
    const src = "export { AILabel, Button, AIBadge };";
    const names = extractNamesFromSource(src);
    expect(names).toContain("AILabel");
    expect(names).toContain("AIBadge");
    expect(names).toContain("Button");
  });

  it("extracts aliased export names (as alias)", () => {
    const src = "export { InternalAILabel as AILabel } from './ai-label';";
    expect(extractNamesFromSource(src)).toContain("AILabel");
  });
});

// ---------------------------------------------------------------------------
// Unit: scanForMarkerComponents
// ---------------------------------------------------------------------------
describe("scanForMarkerComponents", () => {
  it("returns [] when no marker components present", () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { Button } from './button';\nexport { Card } from './card';",
    );
    expect(scanForMarkerComponents(tmp)).toEqual([]);
  });

  it("detects AILabel in src/index.ts exports", () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { AILabel } from './ai-label';\nexport { Button } from './button';",
    );
    const found = scanForMarkerComponents(tmp);
    expect(found).toContain("AILabel");
  });

  it("detects GenAI avatar component by file name", () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "GenAIAvatar.tsx"),
      "export const GenAIAvatar = () => null;",
    );
    const found = scanForMarkerComponents(tmp);
    expect(found).toContain("GenAIAvatar");
  });

  it("detects Polaris magic-* component by file name", () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "magic-icon.tsx"),
      "export const MagicIcon = () => null;",
    );
    const found = scanForMarkerComponents(tmp);
    expect(found).toContain("magic-icon");
  });

  it("deduplicates when same marker name appears in index and component file", () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { AILabel } from './ai-label';",
    );
    writeFileSync(join(tmp, "src", "AILabel.tsx"), "export function AILabel() { return null; }");
    const found = scanForMarkerComponents(tmp);
    expect(found.filter((n) => n.toLowerCase() === "ailabel")).toHaveLength(1);
  });

  it("ignores node_modules and dist directories", () => {
    mkdirSync(join(tmp, "node_modules", "ui"), { recursive: true });
    writeFileSync(
      join(tmp, "node_modules", "ui", "AILabel.tsx"),
      "export const AILabel = () => null;",
    );
    mkdirSync(join(tmp, "dist"), { recursive: true });
    writeFileSync(
      join(tmp, "dist", "AIBadge.tsx"),
      "export const AIBadge = () => null;",
    );
    expect(scanForMarkerComponents(tmp)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration: rule.evaluate
// ---------------------------------------------------------------------------
describe("rule ai-governance/ai-marker-component-present", () => {
  // Fixture 1: AILabel exported from index
  it("emits info finding when AILabel is exported from src/index.ts", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { AILabel } from './ai-label';\nexport { Button } from './button';",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("info");
    expect(f.axis).toBe("ai-governance");
    expect(f.ruleId).toBe("ai-governance/ai-marker-component-present");
    expect(f.message).toContain("AILabel");
  });

  // Fixture 2: GenAI avatar component file
  it("emits info finding when GenAIAvatar component file is present", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "GenAIAvatar.tsx"),
      "export const GenAIAvatar = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("GenAIAvatar");
  });

  // Fixture 3: Polaris magic-* component
  it("emits info finding when Polaris magic-prefixed component file is present", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "magic-sparkle.tsx"),
      "export const MagicSparkle = () => null;",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("magic-sparkle");
  });

  // Fixture 4: reserved AI tokens present but no marker component (the warning case)
  it("emits warning when reserved AI tokens exist but no marker component is detected", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#0875e1" } } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "index.ts"),
      "export { Button } from './button';\nexport { Card } from './card';",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("warning");
    expect(f.ruleId).toBe("ai-governance/ai-marker-component-present");
    expect(f.message).toContain("Reserved AI tokens");
  });

  // Fixture 5: no AI surface at all — no finding
  it("emits no finding when neither reserved tokens nor marker components are present", async () => {
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

  // Fixture 6: allowlist suppresses the rule
  it("is suppressed by README `lyse-disable ai-governance/ai-marker-component-present`", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#abc" } } }),
    );
    writeFileSync(
      join(tmp, "README.md"),
      "# DS\n\n<!-- lyse-disable ai-governance/ai-marker-component-present -->\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 7: allowlist via .lyse.yaml
  it("is suppressed by `.lyse.yaml` containing the disable directive", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#abc" } } }),
    );
    writeFileSync(
      join(tmp, ".lyse.yaml"),
      "# lyse-disable ai-governance/ai-marker-component-present\n",
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 8: no finding when repoRoot is not set
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

  // Fixture 9: Vue SFC with component name option
  it("detects AILabel declared in a Vue SFC component name option", async () => {
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "ai-label.vue"),
      `<script lang="ts">
export default {
  name: 'AILabel',
};
</script>
<template><span>AI</span></template>`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("info");
    expect(result.findings[0]!.message).toContain("AILabel");
  });
});
