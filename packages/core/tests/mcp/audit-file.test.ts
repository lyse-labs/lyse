import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAuditFile } from "../../src/mcp/tools/audit-file.js";

describe("runAuditFile", () => {
  it("audits a TSX file with hardcoded color (real file on disk)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-mcp-af-"));
    const filePath = join(dir, "Page.tsx");
    writeFileSync(filePath, 'export default () => <div style={{ background: "#2563eb" }}>x</div>;');
    const result = await runAuditFile({ path: filePath });
    expect(result.schema_version).toBe("1.0.0");
    const colorViolations = result.violations.filter((v) => v.rule_id === "tokens/no-hardcoded-color");
    expect(colorViolations.length).toBeGreaterThan(0);
  });

  it("audits an UNSAVED buffer when `content` is passed (no file on disk needed)", async () => {
    const result = await runAuditFile({
      path: "/totally/fictional/path/Buffer.tsx",
      content: 'export default () => <div style={{ background: "#ff0000" }}>x</div>;',
    });
    const colorViolations = result.violations.filter((v) => v.rule_id === "tokens/no-hardcoded-color");
    expect(colorViolations.length).toBeGreaterThan(0);
  });

  it("returns no violations for clean code", async () => {
    const result = await runAuditFile({
      path: "Buffer.tsx",
      content: 'export default () => <div className="bg-primary">x</div>;',
    });
    const colorViolations = result.violations.filter((v) => v.rule_id === "tokens/no-hardcoded-color");
    expect(colorViolations).toHaveLength(0);
  });

  it("returns an error finding when `path` is missing", async () => {
    const result = await runAuditFile({});
    expect(result.violations[0]!.rule_id).toBe("internal");
    expect(result.violations[0]!.severity).toBe("error");
  });

  it("returns an error when file doesn't exist and no content given", async () => {
    const result = await runAuditFile({ path: "/nonexistent/file.tsx" });
    expect(result.violations[0]!.rule_id).toBe("internal");
    expect(result.violations[0]!.severity).toBe("error");
  });

  it("returns info for unsupported file types", async () => {
    const result = await runAuditFile({ path: "config.txt", content: "stuff" });
    expect(result.violations[0]!.rule_id).toBe("internal");
    expect(result.violations[0]!.severity).toBe("info");
    expect(result.violations[0]!.message).toContain("Unsupported");
  });

  it("respects project_root override", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-mcp-pr-"));
    writeFileSync(
      join(dir, "tailwind.config.js"),
      `module.exports = { theme: { colors: { primary: "#2563eb" } } };`,
    );
    const result = await runAuditFile({
      path: "Page.tsx",
      content: '<div style={{ background: "#2563eb" }}>x</div>;',
      project_root: dir,
    });
    const colorViolations = result.violations.filter((v) => v.rule_id === "tokens/no-hardcoded-color");
    expect(colorViolations.length).toBeGreaterThan(0);
    // The suggestion should mention the token name `primary` since the project's tokens are loaded.
    const withSuggestion = colorViolations.filter((v) => v.suggestion_available);
    expect(withSuggestion.length).toBeGreaterThan(0);
  });

  it("includes suggestion text when available", async () => {
    const result = await runAuditFile({
      path: "x.tsx",
      content: '<img src="/x.png" />;', // a11y/essentials should fire
    });
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("returns reason: 'rule_not_auto_fixable' for non-auto-fixable rules (a11y/essentials)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-88-"));
    try {
      const file = join(dir, "Bad.jsx");
      writeFileSync(file, `export const Bad = () => <img src="x.png" />;\n`);
      const result = await runAuditFile({ path: file });
      const v = result.violations.find((vv) => vv.rule_id.startsWith("a11y/"));
      expect(v).toBeDefined();
      expect(v!.suggestion_available).toBe(false);
      expect(v!.reason).toBe("rule_not_auto_fixable");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns reason: 'no_token_registry' for an auto-fix rule in a project with no token map", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-88-"));
    try {
      const file = join(dir, "Hardcoded.tsx");
      writeFileSync(
        file,
        `export const Card = () => <div style={{ background: "#ff0000" }} />;\n`,
      );
      const result = await runAuditFile({ path: file });
      const v = result.violations.find(
        (vv) => vv.rule_id === "tokens/no-hardcoded-color",
      );
      expect(v).toBeDefined();
      expect(v!.suggestion_available).toBe(false);
      expect(v!.reason).toBe("no_token_registry");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs the naming rules (registry-driven single-file set), not just the legacy 5", async () => {
    const result = await runAuditFile({
      path: "MixedBag.tsx",
      content:
        'import { useState } from "react";\n' +
        'export function myWidget() { return <div style={{ background: "#123456" }} />; }\n' +
        "export function myData() { const [v] = useState(0); return v; }\n",
    });
    const ids = new Set(result.violations.map((v) => v.rule_id));
    expect(ids.has("tokens/no-hardcoded-color")).toBe(true);
    expect(ids.has("naming/component-pascalcase")).toBe(true);
    expect(ids.has("naming/hook-prefix")).toBe(true);
  });

  it("never emits repo-wide rule ids in single-file mode", async () => {
    const result = await runAuditFile({
      path: "Anything.tsx",
      content:
        'export function myWidget() { return <div style={{ background: "#123456" }} />; }\n',
    });
    for (const v of result.violations) {
      expect(v.rule_id.startsWith("ai-governance/")).toBe(false);
      expect(v.rule_id.startsWith("ai-surface/")).toBe(false);
      expect(v.rule_id).not.toBe("stories/coverage");
    }
  });

  it("omits `reason` when an auto-fix rule resolves a suggestion (tailwind-resolved token)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-88-"));
    try {
      writeFileSync(
        join(dir, "tailwind.config.js"),
        `module.exports = { theme: { colors: { primary: "#2563eb" } } };`,
      );
      const result = await runAuditFile({
        path: "Page.tsx",
        content: '<div style={{ background: "#2563eb" }}>x</div>;',
        project_root: dir,
      });
      const v = result.violations.find(
        (vv) => vv.rule_id === "tokens/no-hardcoded-color" && vv.suggestion_available,
      );
      expect(v).toBeDefined();
      expect(v).not.toHaveProperty("reason");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs components/no-native-shadows single-file when componentsModule is configured", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-mcp-af-shadow-"));
    writeFileSync(join(dir, ".lyse.yaml"), "designSystem:\n  componentsModule: \"@acme/ui\"\n");
    const result = await runAuditFile({
      path: join(dir, "Toolbar.tsx"),
      content: 'import { Card } from "@acme/ui";\nexport default () => <button>save</button>;',
      project_root: dir,
    });
    const shadow = result.violations.filter((v) => v.rule_id === "components/no-native-shadows");
    expect(shadow.length).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });

});
