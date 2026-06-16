import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/a11y-inclusive-language.js";
import type { RuleContext, ParsedFiles, ParsedTsFile } from "../../src/types.js";

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

function makeParsed(opts: {
  css?: { path: string; source: string }[];
  ts?: { path: string; source: string }[];
} = {}): ParsedFiles {
  const ts: ParsedTsFile[] = (opts.ts ?? []).map((f) => ({ path: f.path, ast: null, source: f.source, imports: [] }));
  return { ts, css: opts.css ?? [], cssInJs: [] };
}

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-inclusive-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule a11y/inclusive-language", () => {
  it("flags `whitelist` and suggests allowlist", async () => {
    const parsed = makeParsed({ ts: [{ path: "src/cfg.ts", source: "const whitelist = [];" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("a11y/inclusive-language");
    expect(result.findings[0]!.axis).toBe("a11y");
    expect(result.findings[0]!.suggestion).toMatch(/allowlist/i);
  });

  it("flags camelCase `blackList`", async () => {
    const parsed = makeParsed({ ts: [{ path: "src/cfg.ts", source: "let blackList = 1;" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.suggestion).toMatch(/denylist|blocklist/i);
  });

  it("flags `sanity check` in a comment", async () => {
    const parsed = makeParsed({ ts: [{ path: "src/x.ts", source: "// sanity check the input\nconst a = 1;" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.location.line).toBe(1);
  });

  it("flags `slave` in CSS", async () => {
    const parsed = makeParsed({ css: [{ path: "a.css", source: ".slave-pane { color: red; }" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(1);
  });

  it("does NOT flag `master` (excluded for precision)", async () => {
    const parsed = makeParsed({
      ts: [{ path: "src/x.ts", source: "const masterclass = 1; // master branch\nconst dummy = 2;" }],
    });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
  });

  it("is N/A when no flagged term is present", async () => {
    const parsed = makeParsed({ ts: [{ path: "src/x.ts", source: "const allowlist = []; const denylist = [];" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("is allowlisted by a README lyse-disable directive", async () => {
    writeFileSync(join(tmp, "README.md"), "# DS\n\nlyse-disable a11y/inclusive-language\n");
    const parsed = makeParsed({ ts: [{ path: "src/cfg.ts", source: "const whitelist = [];" }] });
    const result = await rule.evaluate(makeCtx(tmp), parsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  describe("_internal.findTerms", () => {
    it("returns the term + suggestion for each non-inclusive match", () => {
      const hits = _internal.findTerms("whitelist and blacklist");
      expect(hits.map((h) => h.term)).toEqual(["whitelist", "blacklist"]);
    });
    it("ignores `master` and `dummy`", () => {
      expect(_internal.findTerms("master dummy mastered")).toEqual([]);
    });
  });
});
