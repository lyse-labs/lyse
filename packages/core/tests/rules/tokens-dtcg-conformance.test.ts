import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/tokens-dtcg-conformance.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

function makeCtx(repoRoot: string, excludePaths: string[] = []): RuleContext {
  return {
    repoRoot,
    tokens: null,
    componentsModule: null,
    componentInventory: [],
    storyIndex: null,
    excludePaths,
  };
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-dtcg-conformance-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("rule tokens/dtcg-conformance", () => {
  it("reports 0 findings on a valid DTCG file", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        color: {
          brand: { $value: "#2563eb", $type: "color" },
          accent: { $value: "{color.brand}", $type: "color" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(2);
  });

  it("flags a token missing $type when the value is clearly a color", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        color: { brand: { $value: "#2563eb" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const missingType = result.findings.filter((f) =>
      f.message.includes("no $type"),
    );
    expect(missingType).toHaveLength(1);
    expect(missingType[0]?.suggestion).toContain("color");
  });

  it("flags a broken alias that doesn't resolve", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        color: {
          accent: { $value: "{color.does-not-exist}", $type: "color" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const brokenAlias = result.findings.filter((f) =>
      f.message.includes("unresolved alias"),
    );
    expect(brokenAlias).toHaveLength(1);
  });

  it("flags a composite shadow token with the wrong shape (string instead of object)", async () => {
    writeFileSync(
      join(tmp, "shadow.tokens.json"),
      JSON.stringify({
        shadow: {
          sm: { $type: "shadow", $value: "0 1px 2px rgba(0,0,0,0.1)" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const shadowIssues = result.findings.filter((f) =>
      f.message.includes("shadow $value"),
    );
    expect(shadowIssues.length).toBeGreaterThanOrEqual(1);
  });

  it("flags a composite shadow object missing a required field", async () => {
    writeFileSync(
      join(tmp, "shadow.tokens.json"),
      JSON.stringify({
        shadow: {
          sm: {
            $type: "shadow",
            $value: { offsetX: "0", offsetY: "1px", color: "rgba(0,0,0,0.1)" },
          },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(
      result.findings.some((f) => f.message.includes('missing required field "blur"')),
    ).toBe(true);
  });

  it("does not flag a non-DTCG JSON file", async () => {
    writeFileSync(
      join(tmp, "package.tokens.json"),
      JSON.stringify({ name: "foo", version: "1.0.0" }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("does not flag empty files", async () => {
    writeFileSync(join(tmp, "empty.tokens.json"), "");
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("respects ctx.excludePaths", async () => {
    mkdirSync(join(tmp, "examples"), { recursive: true });
    writeFileSync(
      join(tmp, "examples", "demo.tokens.json"),
      JSON.stringify({ color: { brand: { $value: "#fff" } } }),
    );
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({ color: { brand: { $value: "#fff" } } }),
    );
    const result = await rule.evaluate(makeCtx(tmp, ["examples/**"]), emptyParsed);
    // examples/demo.tokens.json should be skipped, design.tokens.json flagged
    const files = new Set(result.findings.map((f) => f.location.file));
    expect(Array.from(files).some((f) => f.startsWith("examples/"))).toBe(false);
    expect(Array.from(files).some((f) => f === "design.tokens.json")).toBe(true);
  });

  it("self-test: scans a fixture and asserts an exact finding count", async () => {
    // Fixture: 1 missing-type + 1 broken alias + 1 shadow shape issue = 3 findings.
    mkdirSync(join(tmp, "tokens"), { recursive: true });
    writeFileSync(
      join(tmp, "tokens", "fixture.json"),
      JSON.stringify({
        color: {
          brand: { $value: "#2563eb" }, // missing $type, inferable as color
          accent: { $value: "{color.unknown}", $type: "color" }, // broken alias
        },
        shadow: {
          sm: { $type: "shadow", $value: "0 1px 2px rgba(0,0,0,0.1)" }, // wrong shape
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(3);
    // 3 leaf tokens scanned
    expect(result.opportunities).toBe(3);
  });

  it("does not flag aliases that resolve correctly", async () => {
    writeFileSync(
      join(tmp, "good.tokens.json"),
      JSON.stringify({
        color: {
          brand: { $value: "#2563eb", $type: "color" },
        },
        semantic: {
          primary: { $value: "{color.brand}", $type: "color" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("returns 0 findings on a repo with no DTCG files", async () => {
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});

describe("internal helpers", () => {
  it("looksLikeDtcg detects a $value somewhere in the tree", () => {
    expect(
      _internal.looksLikeDtcg({ color: { brand: { $value: "#fff" } } }),
    ).toBe(true);
    expect(_internal.looksLikeDtcg({ name: "foo" })).toBe(false);
    expect(_internal.looksLikeDtcg(null)).toBe(false);
    expect(_internal.looksLikeDtcg([])).toBe(false);
  });

  it("inferTypeFromValue recognises common value shapes", () => {
    expect(_internal.inferTypeFromValue("#fff")).toBe("color");
    expect(_internal.inferTypeFromValue("rgb(0,0,0)")).toBe("color");
    expect(_internal.inferTypeFromValue("16px")).toBe("dimension");
    expect(_internal.inferTypeFromValue("200ms")).toBe("duration");
    expect(_internal.inferTypeFromValue(400)).toBe("number");
    expect(_internal.inferTypeFromValue([0.4, 0, 0.2, 1])).toBe("cubicBezier");
    expect(_internal.inferTypeFromValue({ offsetX: "0", offsetY: "1px", blur: "2px", color: "#fff" })).toBe("shadow");
    expect(_internal.inferTypeFromValue("not a known shape")).toBeNull();
  });
});
