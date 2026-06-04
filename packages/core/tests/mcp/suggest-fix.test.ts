import { describe, it, expect } from "vitest";
import { runSuggestFix } from "../../src/mcp/tools/suggest-fix.js";
import { suggestFixTool } from "../../src/mcp/tools/suggest-fix.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("suggestFixTool definition", () => {
  it("has correct name and required schema", () => {
    expect(suggestFixTool.name).toBe("suggest_fix");
    expect(suggestFixTool.inputSchema.required).toContain("path");
    expect(suggestFixTool.inputSchema.required).toContain("rule_id");
    expect(suggestFixTool.inputSchema.required).toContain("line");
  });

  it("describes the 3 auto-fixable rules in its description", () => {
    expect(suggestFixTool.description).toContain("tokens/no-hardcoded-color");
    expect(suggestFixTool.description).toContain("tokens/no-hardcoded-spacing");
    expect(suggestFixTool.description).toContain("components/no-native-shadows");
  });
});

describe("runSuggestFix", () => {
  it("returns a patch for tokens/no-hardcoded-color with content (unsaved buffer)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-sf-color-"));
    writeFileSync(
      join(tmp, "tailwind.config.js"),
      `module.exports = { theme: { colors: { primary: "#2563eb" } } };`,
    );
    const r = await runSuggestFix({
      path: "Page.tsx",
      content: 'const x = "#2563eb";\n',
      project_root: tmp,
      rule_id: "tokens/no-hardcoded-color",
      line: 1,
      column: 1,
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain("--color-primary");
    expect(r.confidence).toBeGreaterThan(0.9);
    expect(r.rule_id).toBe("tokens/no-hardcoded-color");
    expect(r.schema_version).toBe("1.0.0");
  });

  it("returns a patch for tokens/no-hardcoded-spacing with content (unsaved buffer)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lyse-sf-spacing-"));
    writeFileSync(
      join(tmp, "tailwind.config.js"),
      `module.exports = { theme: { spacing: { "4": "16px" } } };`,
    );
    const r = await runSuggestFix({
      path: "Page.tsx",
      content: 'const s = { padding: "16px" };\n',
      project_root: tmp,
      rule_id: "tokens/no-hardcoded-spacing",
      line: 1,
    });
    expect(r.patch).not.toBeNull();
    expect(r.patch).toContain("--spacing-4");
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it("returns patch:null + rationale for a11y/essentials (not auto-fixable)", async () => {
    const r = await runSuggestFix({
      path: "x.tsx",
      content: "<img />",
      rule_id: "a11y/essentials",
      line: 1,
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("designer judgment");
  });

  it("returns patch:null + rationale for stories/coverage (not auto-fixable)", async () => {
    const r = await runSuggestFix({
      path: "x.tsx",
      content: "x",
      rule_id: "stories/coverage",
      line: 1,
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("variants");
  });

  it("returns patch:null when required args missing", async () => {
    const r = await runSuggestFix({ path: "x" });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("Required args");
  });

  it("returns patch:null when file doesn't exist and no content given", async () => {
    const r = await runSuggestFix({
      path: "/totally/nonexistent/path/File.tsx",
      rule_id: "tokens/no-hardcoded-color",
      line: 1,
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("Could not read file");
  });

  it("returns patch:null + rationale for an unknown rule", async () => {
    const r = await runSuggestFix({
      path: "x.tsx",
      content: "x",
      rule_id: "some/unknown-rule",
      line: 1,
    });
    expect(r.patch).toBeNull();
    expect(r.rationale).toContain("Unknown rule");
  });
});
