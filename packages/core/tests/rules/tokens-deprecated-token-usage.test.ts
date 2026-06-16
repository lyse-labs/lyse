import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule } from "../../src/rules/tokens-deprecated-token-usage.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string): RuleContext {
  return { repoRoot, tokens: null, componentsModule: null, componentInventory: [], storyIndex: null, excludePaths: [] };
}

function writeTokens(dir: string, name: string, obj: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(obj));
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-deptok-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("rule tokens/deprecated-token-usage", () => {
  it("warns when a token aliases a deprecated token", async () => {
    writeTokens(tmp, "design.tokens.json", {
      color: {
        old: { $value: "#000000", $deprecated: true },
        text: { $value: "{color.old}" },
      },
    });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.ruleId).toBe("tokens/deprecated-token-usage");
    expect(r.findings[0]!.axis).toBe("tokens");
    expect(r.findings[0]!.message).toContain("color.old");
  });

  it("warns when a token aliases a deprecated token via a $ref JSON-Pointer", async () => {
    writeTokens(tmp, "design.tokens.json", {
      color: {
        old: { $value: "#000000", $deprecated: true },
        text: { $value: { $ref: "#/color/old" } },
      },
    });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toContain("color.old");
  });

  it("supports a string $deprecated reason", async () => {
    writeTokens(tmp, "design.tokens.json", {
      color: {
        old: { $value: "#000000", $deprecated: "use color.ink" },
        text: { $value: "{color.old}" },
      },
    });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
  });

  it("no finding when the deprecated token is not aliased", async () => {
    writeTokens(tmp, "design.tokens.json", {
      color: {
        old: { $value: "#000000", $deprecated: true },
        ink: { $value: "#111111" },
        text: { $value: "{color.ink}" },
      },
    });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("no finding when nothing is deprecated", async () => {
    writeTokens(tmp, "design.tokens.json", {
      color: { ink: { $value: "#111111" }, text: { $value: "{color.ink}" } },
    });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("resolves a cross-file alias to a deprecated token", async () => {
    mkdirSync(join(tmp, "tokens"));
    writeTokens(join(tmp, "tokens"), "base.json", { color: { old: { $value: "#000000", $deprecated: true } } });
    writeTokens(join(tmp, "tokens"), "semantic.json", { color: { text: { $value: "{color.old}" } } });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(1);
  });

  it("$deprecated:false is not treated as deprecated", async () => {
    writeTokens(tmp, "design.tokens.json", {
      color: { old: { $value: "#000000", $deprecated: false }, text: { $value: "{color.old}" } },
    });
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
  });

  it("no findings when there are no token files", async () => {
    const r = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });

  it("no findings when repoRoot is empty", async () => {
    const r = await rule.evaluate({ ...makeCtx(tmp), repoRoot: "" }, emptyParsed);
    expect(r.findings).toHaveLength(0);
    expect(r.opportunities).toBe(0);
  });
});
