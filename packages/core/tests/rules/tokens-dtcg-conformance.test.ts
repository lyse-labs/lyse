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
  it("reports 0 findings on a fully conformant DTCG file", async () => {
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
    expect(missingType[0]?.severity).toBe("warning");
    expect(missingType[0]?.suggestion).toContain("color");
  });

  it("flags a broken alias as an error", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        color: {
          accent: { $value: "{color.does-not-exist}", $type: "color" },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const broken = result.findings.filter((f) => f.message.includes("unresolved alias"));
    expect(broken).toHaveLength(1);
    expect(broken[0]?.severity).toBe("error");
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
    const files = new Set(result.findings.map((f) => f.location.file));
    expect(Array.from(files).some((f) => f.startsWith("examples/"))).toBe(false);
    expect(Array.from(files).some((f) => f === "design.tokens.json")).toBe(true);
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

  // ----- Strict type-specific validation fixtures (one per primary $type) -----

  it("color: flags a $type=color token whose $value is not a CSS color (error)", async () => {
    writeFileSync(
      join(tmp, "color.tokens.json"),
      JSON.stringify({
        color: { broken: { $type: "color", $value: "not-a-color" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const colorErrors = result.findings.filter((f) =>
      f.message.includes("is not a recognized CSS color"),
    );
    expect(colorErrors).toHaveLength(1);
    expect(colorErrors[0]?.severity).toBe("error");
  });

  it("dimension: flags a $type=dimension token whose $value lacks a unit (error)", async () => {
    writeFileSync(
      join(tmp, "dimension.tokens.json"),
      JSON.stringify({
        spacing: { sm: { $type: "dimension", $value: "16" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const dimErrors = result.findings.filter((f) =>
      f.message.includes("lacks a recognized CSS unit"),
    );
    expect(dimErrors).toHaveLength(1);
    expect(dimErrors[0]?.severity).toBe("error");
  });

  it("fontFamily: flags a $type=fontFamily token with an empty string $value (error)", async () => {
    writeFileSync(
      join(tmp, "font.tokens.json"),
      JSON.stringify({
        fontFamily: { body: { $type: "fontFamily", $value: "" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const ffErrors = result.findings.filter((f) =>
      f.message.includes("fontFamily $value"),
    );
    expect(ffErrors).toHaveLength(1);
    expect(ffErrors[0]?.severity).toBe("error");
  });

  it("fontWeight: flags a $type=fontWeight token outside the [1, 1000] range (error)", async () => {
    writeFileSync(
      join(tmp, "weight.tokens.json"),
      JSON.stringify({
        fontWeight: { regular: { $type: "fontWeight", $value: 1234 } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const fwErrors = result.findings.filter((f) =>
      f.message.includes("fontWeight $value"),
    );
    expect(fwErrors).toHaveLength(1);
    expect(fwErrors[0]?.severity).toBe("error");
  });

  it("fontWeight: accepts named weights like 'bold'", async () => {
    writeFileSync(
      join(tmp, "weight.tokens.json"),
      JSON.stringify({
        fontWeight: { bold: { $type: "fontWeight", $value: "bold" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  it("duration: flags a $type=duration token without a time unit (error)", async () => {
    writeFileSync(
      join(tmp, "duration.tokens.json"),
      JSON.stringify({
        duration: { fast: { $type: "duration", $value: "200" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const durErrors = result.findings.filter((f) =>
      f.message.includes("duration $value"),
    );
    expect(durErrors).toHaveLength(1);
    expect(durErrors[0]?.severity).toBe("error");
  });

  it("cubicBezier: flags a $type=cubicBezier token whose array does not have 4 numbers (error)", async () => {
    writeFileSync(
      join(tmp, "easing.tokens.json"),
      JSON.stringify({
        easing: { standard: { $type: "cubicBezier", $value: [0.4, 0, 0.2] } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const cbErrors = result.findings.filter((f) =>
      f.message.includes("cubicBezier"),
    );
    expect(cbErrors).toHaveLength(1);
    expect(cbErrors[0]?.severity).toBe("error");
  });

  it("number: flags a $type=number token whose $value is a string (error)", async () => {
    writeFileSync(
      join(tmp, "z.tokens.json"),
      JSON.stringify({
        zIndex: { modal: { $type: "number", $value: "1000" } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const nErrors = result.findings.filter((f) =>
      f.message.includes("number $value"),
    );
    expect(nErrors).toHaveLength(1);
    expect(nErrors[0]?.severity).toBe("error");
  });

  it("accepts a fully conformant fixture covering every primary $type", async () => {
    writeFileSync(
      join(tmp, "all.tokens.json"),
      JSON.stringify({
        color: { brand: { $type: "color", $value: "#2563eb" } },
        spacing: { sm: { $type: "dimension", $value: "8px" } },
        fontFamily: { body: { $type: "fontFamily", $value: "Inter" } },
        fontWeight: { regular: { $type: "fontWeight", $value: 400 } },
        duration: { fast: { $type: "duration", $value: "200ms" } },
        easing: { standard: { $type: "cubicBezier", $value: [0.4, 0, 0.2, 1] } },
        zIndex: { modal: { $type: "number", $value: 1000 } },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(7);
  });

  it("respects per-token $extensions.lyse.disable allowlist", async () => {
    writeFileSync(
      join(tmp, "design.tokens.json"),
      JSON.stringify({
        color: {
          legacy: {
            $type: "color",
            $value: "blu", // invalid color, but explicitly opted out
            $extensions: { lyse: { disable: ["tokens/dtcg-conformance"] } },
          },
        },
      }),
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
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

  it("validateColorValue accepts hex / rgb() / hsl() / oklch() / named / DTCG object, rejects garbage", () => {
    expect(_internal.validateColorValue("#fff").ok).toBe(true);
    expect(_internal.validateColorValue("#ff0000").ok).toBe(true);
    expect(_internal.validateColorValue("rgb(0,0,0)").ok).toBe(true);
    expect(_internal.validateColorValue("hsl(120, 50%, 50%)").ok).toBe(true);
    expect(_internal.validateColorValue("oklch(0.7 0.15 200)").ok).toBe(true);
    expect(_internal.validateColorValue("rebeccapurple").ok).toBe(true);
    // DTCG canonical color objects (Tokens Studio / Figma exports / Style Dictionary v4)
    expect(_internal.validateColorValue({ colorSpace: "srgb", components: [1, 0, 0] }).ok).toBe(true);
    expect(_internal.validateColorValue({ colorSpace: "display-p3", components: [0.5, 0.5, 0.5], alpha: 0.8 }).ok).toBe(true);
    expect(_internal.validateColorValue("not-a-color").ok).toBe(false);
    expect(_internal.validateColorValue(42).ok).toBe(false);
    expect(_internal.validateColorValue({ colorSpace: "srgb" }).ok).toBe(false);
    expect(_internal.validateColorValue({ components: [1, 0, 0] }).ok).toBe(false);
  });

  it("validateDimensionValue requires a CSS unit or DTCG object form", () => {
    expect(_internal.validateDimensionValue("16px").ok).toBe(true);
    expect(_internal.validateDimensionValue("1rem").ok).toBe(true);
    expect(_internal.validateDimensionValue("100%").ok).toBe(true);
    // DTCG canonical dimension objects
    expect(_internal.validateDimensionValue({ value: 16, unit: "px" }).ok).toBe(true);
    expect(_internal.validateDimensionValue({ value: 1.5, unit: "rem" }).ok).toBe(true);
    expect(_internal.validateDimensionValue("16").ok).toBe(false);
    expect(_internal.validateDimensionValue("0").ok).toBe(false);
    expect(_internal.validateDimensionValue(16).ok).toBe(false);
    expect(_internal.validateDimensionValue({ value: 16, unit: "em" }).ok).toBe(false);
    expect(_internal.validateDimensionValue({ unit: "px" }).ok).toBe(false);
  });

  it("validateFontWeightValue clamps to [1, 1000] and accepts named weights (hyphenated and unhyphenated)", () => {
    expect(_internal.validateFontWeightValue(400).ok).toBe(true);
    expect(_internal.validateFontWeightValue(1).ok).toBe(true);
    expect(_internal.validateFontWeightValue(1000).ok).toBe(true);
    expect(_internal.validateFontWeightValue("bold").ok).toBe(true);
    // Tailwind / Style Dictionary / Tokens Studio emit unhyphenated forms
    expect(_internal.validateFontWeightValue("semibold").ok).toBe(true);
    expect(_internal.validateFontWeightValue("extrabold").ok).toBe(true);
    expect(_internal.validateFontWeightValue("extralight").ok).toBe(true);
    expect(_internal.validateFontWeightValue("semi-bold").ok).toBe(true);
    expect(_internal.validateFontWeightValue(1234).ok).toBe(false);
    expect(_internal.validateFontWeightValue(0).ok).toBe(false);
  });

  it("validateDurationValue requires ms or s suffix", () => {
    expect(_internal.validateDurationValue("200ms").ok).toBe(true);
    expect(_internal.validateDurationValue("0.2s").ok).toBe(true);
    expect(_internal.validateDurationValue("200").ok).toBe(false);
    expect(_internal.validateDurationValue(200).ok).toBe(false);
  });

  it("validateCubicBezierValue accepts 4-number arrays, named easings, and cubic-bezier()", () => {
    expect(_internal.validateCubicBezierValue([0.4, 0, 0.2, 1]).ok).toBe(true);
    expect(_internal.validateCubicBezierValue("ease-in-out").ok).toBe(true);
    expect(_internal.validateCubicBezierValue("cubic-bezier(0.4, 0, 0.2, 1)").ok).toBe(true);
    expect(_internal.validateCubicBezierValue([0.4, 0, 0.2]).ok).toBe(false);
    expect(_internal.validateCubicBezierValue("squiggle").ok).toBe(false);
  });
});
