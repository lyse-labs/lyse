import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/versioning-migration-guide-present.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-migration-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule versioning/migration-guide-present", () => {
  it("no finding for a root MIGRATION.md", async () => {
    writeFileSync(join(tmp, "MIGRATION.md"), "# Migration\n\n## v1 → v2\n- rename Button\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("no finding for UPGRADING.md", async () => {
    writeFileSync(join(tmp, "UPGRADING.md"), "# Upgrading\n- steps\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("recognizes a guide under docs/", async () => {
    mkdirSync(join(tmp, "docs"));
    writeFileSync(join(tmp, "docs", "migrating-to-v3.md"), "# Migrating\n- steps\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("recognizes a ## Migration heading inside CHANGELOG", async () => {
    writeFileSync(join(tmp, "CHANGELOG.md"), "# Changelog\n\n## [2.0.0]\n\n### Migration\nUse the codemod.\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("emits one warning when no migration guide exists", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nA component library.\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("versioning/migration-guide-present");
    expect(r.findings[0]!.axis).toBe("ai-surface");
    expect(r.findings[0]!.severity).toBe("warning");
  });

  it("a plain CHANGELOG with no migration section still warns", async () => {
    writeFileSync(join(tmp, "CHANGELOG.md"), "# Changelog\n\n## [1.0.0]\n### Added\n- Button\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
  });

  it("is suppressed by the lyse-disable directive in a README", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable versioning/migration-guide-present\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("no findings when repoRoot is empty", async () => {
    const r = await rule.evaluate({ ...makeCtx(tmp), repoRoot: "" }, emptyParsed);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
});

describe("_internal helpers", () => {
  it("isGuideFilename matches migration/upgrade names, rejects others", () => {
    expect(_internal.isGuideFilename("MIGRATION.md")).toBe(true);
    expect(_internal.isGuideFilename("UPGRADING.md")).toBe(true);
    expect(_internal.isGuideFilename("migrating-to-v2.md")).toBe(true);
    expect(_internal.isGuideFilename("upgrade.mdx")).toBe(true);
    expect(_internal.isGuideFilename("MIGRATION")).toBe(true);
    expect(_internal.isGuideFilename("README.md")).toBe(false);
    expect(_internal.isGuideFilename("CHANGELOG.md")).toBe(false);
    expect(_internal.isGuideFilename("migrations.sql")).toBe(false);
  });
});
