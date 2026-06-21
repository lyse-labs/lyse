import { describe, it, expect } from "vitest";
import { auditDirectory } from "../../src/commands/audit-pipeline.js";
import { join } from "node:path";

const SVELTE_DS = join(__dirname, "..", "..", "fixtures", "svelte-ds");

describe("Svelte coverage — framework-agnostic rules on .svelte SFCs (#102)", () => {
  it("fires token rules on a .svelte <style> block, with correct source lines", async () => {
    const { result } = await auditDirectory(SVELTE_DS, { staticOnly: true });
    const svelte = result.findings.filter((f) => f.location.file.endsWith("Button.svelte"));

    const ruleIds = new Set(svelte.map((f) => f.ruleId));
    expect(ruleIds.has("tokens/no-hardcoded-color")).toBe(true);
    expect(ruleIds.has("tokens/no-hardcoded-spacing")).toBe(true);
    expect(ruleIds.has("tokens/no-hardcoded-border-radius")).toBe(true);

    // Line-accuracy: the SFC extractor is line-preserving, so the color finding
    // must land on the actual <style> source line, not line 1.
    const color = svelte.find((f) => f.ruleId === "tokens/no-hardcoded-color");
    expect(color).toBeDefined();
    expect(color!.location.line).toBeGreaterThan(5);
  });

  it("a Svelte design system is scored, not flagged not-a-design-system", async () => {
    const { result } = await auditDirectory(SVELTE_DS, { staticOnly: true });
    expect(result.meta.notADesignSystem ?? false).toBe(false);
  });
});
