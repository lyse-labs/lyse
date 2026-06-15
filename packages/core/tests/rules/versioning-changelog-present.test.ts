import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/versioning-changelog-present.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-changelog-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule versioning/changelog-present", () => {
  it("no finding for a Keep-a-Changelog CHANGELOG.md (## [1.0.0])", async () => {
    writeFileSync(join(tmp, "CHANGELOG.md"), "# Changelog\n\n## [1.2.0] - 2026-01-01\n### Added\n- thing\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("no finding for a `## v1.2.3` style CHANGELOG", async () => {
    writeFileSync(join(tmp, "CHANGELOG.md"), "# Changes\n\n## v2.0.0\n- breaking\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("recognizes HISTORY.md / CHANGES.md aliases", async () => {
    writeFileSync(join(tmp, "HISTORY.md"), "## [0.1.0]\n- init\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("emits one warning when no changelog file exists", async () => {
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("versioning/changelog-present");
    expect(r.findings[0]!.axis).toBe("ai-surface");
    expect(r.findings[0]!.severity).toBe("warning");
  });

  it("emits one warning when a CHANGELOG exists but has no version-structured entries", async () => {
    writeFileSync(join(tmp, "CHANGELOG.md"), "# Changelog\n\nWe ship updates sometimes. See the git log.\n");
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
  });

  it("is suppressed by the lyse-disable directive in a README", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable versioning/changelog-present\n");
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
  it("hasVersionEntries detects Keep-a-Changelog and v-prefix headings", () => {
    expect(_internal.hasVersionEntries("## [1.0.0]")).toBe(true);
    expect(_internal.hasVersionEntries("## v1.0.0")).toBe(true);
    expect(_internal.hasVersionEntries("## 1.0.0 - 2026")).toBe(true);
    expect(_internal.hasVersionEntries("just prose, no versions")).toBe(false);
  });
});
