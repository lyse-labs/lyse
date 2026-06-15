import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/versioning-semver-versioning.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

function writePkg(dir: string, obj: Record<string, unknown>): void {
  writeFileSync(join(dir, "package.json"), JSON.stringify(obj));
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-semver-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule versioning/semver-versioning", () => {
  it("no finding for a valid 1.x version", async () => {
    writePkg(tmp, { name: "ds", version: "1.2.0" });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("no finding for a valid pre-1.0 (0.x) version", async () => {
    writePkg(tmp, { name: "ds", version: "0.3.0" });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("no finding for pre-release / build metadata versions", async () => {
    writePkg(tmp, { name: "ds", version: "2.0.0-beta.1+sha.abc" });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("passes when only a workspace manifest carries the version (private monorepo root)", async () => {
    writePkg(tmp, { name: "root", private: true, workspaces: ["packages/*"] });
    mkdirSync(join(tmp, "packages", "ds"), { recursive: true });
    writePkg(join(tmp, "packages", "ds"), { name: "@scope/ds", version: "1.0.0" });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("emits one warning when no package.json exists", async () => {
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("versioning/semver-versioning");
    expect(r.findings[0]!.axis).toBe("ai-surface");
    expect(r.findings[0]!.severity).toBe("warning");
  });

  it("emits one warning when version is present but not valid semver", async () => {
    writePkg(tmp, { name: "ds", version: "latest" });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
  });

  it("emits one warning for a two-segment version (1.0)", async () => {
    writePkg(tmp, { name: "ds", version: "1.0" });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
  });

  it("is suppressed by the lyse-disable directive in a README", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable versioning/semver-versioning\n");
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
  it("isValidSemver accepts x.y.z, 0.x, pre-release, build; rejects partials/labels", () => {
    expect(_internal.isValidSemver("1.2.3")).toBe(true);
    expect(_internal.isValidSemver("0.0.1")).toBe(true);
    expect(_internal.isValidSemver("2.0.0-beta.1+sha.abc")).toBe(true);
    expect(_internal.isValidSemver("1.0")).toBe(false);
    expect(_internal.isValidSemver("latest")).toBe(false);
    expect(_internal.isValidSemver("2026-01-01")).toBe(false);
    expect(_internal.isValidSemver(undefined)).toBe(false);
    expect(_internal.isValidSemver(123)).toBe(false);
  });
});
