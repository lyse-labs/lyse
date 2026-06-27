import { describe, it, expect } from "vitest";
import { buildClassifyContext, populateConfidence } from "./safety.js";
import type { AuditResult, Finding, TokenMap, LyseConfig } from "../types.js";

function tokenMapWith(colors: Record<string, string[]>): TokenMap {
  return {
    colors: new Map(Object.entries(colors)),
    spacing: new Map(),
    typography: new Map(),
    radii: new Map(),
    shadows: new Map(),
    motion: new Map(),
    breakpoints: new Map(),
    zIndex: new Map(),
    opacity: new Map(),
    borderWidth: new Map(),
    source: "mixed",
  };
}

function colorFinding(value: string, file = "src/Button.tsx"): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file, line: 1, column: 1 },
    message: `Hardcoded color value: ${value}`,
  };
}

const EMPTY_CONFIG: LyseConfig = {};

describe("buildClassifyContext", () => {
  it("derives the component-name set from components-axis findings only", () => {
    const findings: Finding[] = [
      {
        ruleId: "naming/component-pascalcase",
        axis: "components",
        severity: "warning",
        location: { file: "a.tsx", line: 1, column: 1 },
        message: "x",
      },
      colorFinding("#fff", "b.tsx"),
    ];
    const ctx = buildClassifyContext(findings, null, EMPTY_CONFIG);
    expect(ctx.components.has("naming/component-pascalcase")).toBe(true);
    expect(ctx.components.has("tokens/no-hardcoded-color")).toBe(false);
  });

  it("omits repoRoot when not provided (exactOptionalPropertyTypes-safe)", () => {
    const ctx = buildClassifyContext([], null, EMPTY_CONFIG);
    expect("repoRoot" in ctx).toBe(false);
  });

  it("threads repoRoot into the context when provided (keeps menu count in sync with fix)", () => {
    // Some rules downgrade confidence based on repoRoot (e.g. token-definition
    // files). The menu must pass the same repoRoot as `runFix` or its count
    // would desync; guard that the helper forwards it.
    const ctx = buildClassifyContext([], null, EMPTY_CONFIG, "/repo/root");
    expect(ctx.repoRoot).toBe("/repo/root");
  });
});

function makeAuditResult(findings: Finding[]): AuditResult {
  return {
    schemaVersion: 2,
    rulesVersion: "test",
    toolVersion: "test",
    scoringVersion: "scoring-v1",
    repoRoot: "/repo",
    timestamp: "2026-01-01T00:00:00.000Z",
    stack: [],
    finalScore: 100,
    tier: "excellent",
    axes: [],
    findings,
  };
}

describe("populateConfidence", () => {
  // Bug fix (#16, #17): the audit pipeline emits Finding objects without a
  // `confidence` field, so the CLI's score-gauge experimental counter and the
  // ESLint-style "EXP" tag were both inert. populateConfidence runs each
  // finding through the owning rule's classifyConfidence so downstream
  // consumers see a populated value.

  it("sets confidence on every finding (high when token maps cleanly)", () => {
    const tokens = tokenMapWith({ "#fff": ["color.white"] });
    const result = makeAuditResult([colorFinding("#fff")]);
    const ctx = buildClassifyContext(result.findings, tokens, EMPTY_CONFIG, "/repo");
    const populated = populateConfidence(result, ctx);
    expect(populated.findings[0]?.confidence).toBe("high");
  });

  it("sets confidence='low' when no token matches (drives the EXP tag + experimental counter)", () => {
    const tokens = tokenMapWith({ "#000": ["color.black"] });
    const result = makeAuditResult([colorFinding("#fff")]);
    const ctx = buildClassifyContext(result.findings, tokens, EMPTY_CONFIG, "/repo");
    const populated = populateConfidence(result, ctx);
    expect(populated.findings[0]?.confidence).toBe("low");
  });

  it("sets confidence on every finding even when the rule has no classifyConfidence (defaults to low)", () => {
    // Rules without a classifyConfidence implementation get "low" via the
    // safe-default dispatch in classifyConfidence(). Either way the field
    // must be present on every emitted finding so the renderer + score gauge
    // are not silently inert.
    const findings: Finding[] = [
      {
        ruleId: "unknown-rule-id",
        axis: "a11y",
        severity: "warning",
        location: { file: "x.tsx", line: 1, column: 1 },
        message: "n/a",
      },
    ];
    const result = makeAuditResult(findings);
    const ctx = buildClassifyContext(findings, null, EMPTY_CONFIG);
    const populated = populateConfidence(result, ctx);
    expect(populated.findings[0]?.confidence).toBeDefined();
    expect(populated.findings[0]?.confidence).toBe("low");
  });

  it("returns a new result + new finding objects (no in-place mutation)", () => {
    const result = makeAuditResult([colorFinding("#fff")]);
    const ctx = buildClassifyContext(result.findings, null, EMPTY_CONFIG);
    const populated = populateConfidence(result, ctx);
    expect(populated).not.toBe(result);
    expect(populated.findings).not.toBe(result.findings);
    expect(populated.findings[0]).not.toBe(result.findings[0]);
    // The input result's finding must remain untouched.
    expect(result.findings[0]?.confidence).toBeUndefined();
  });

  it("preserves non-finding AuditResult fields verbatim", () => {
    const result = makeAuditResult([colorFinding("#fff")]);
    const ctx = buildClassifyContext(result.findings, null, EMPTY_CONFIG);
    const populated = populateConfidence(result, ctx);
    expect(populated.finalScore).toBe(result.finalScore);
    expect(populated.tier).toBe(result.tier);
    expect(populated.toolVersion).toBe(result.toolVersion);
    expect(populated.repoRoot).toBe(result.repoRoot);
  });
});
