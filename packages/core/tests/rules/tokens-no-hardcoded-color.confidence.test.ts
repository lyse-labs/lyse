import { join, resolve } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { rule } from "../../src/rules/tokens-no-hardcoded-color.js";
import { getTsMorphProject } from "../../src/parsers/ts-morph-project.js";
import { populateConfidence } from "../../src/codemods/safety.js";
import type { AuditResult, Finding, ClassifyContext, TokenMap } from "../../src/types.js";

function makeCtx(
  colors: Map<string, string[]>,
  opts: { repoRoot?: string } = {},
): ClassifyContext {
  const tokens: TokenMap = {
    colors,
    spacing: new Map(),
    typography: new Map(),
    radii: new Map(),
    shadows: new Map(),
    motion: new Map(),
    breakpoints: new Map(),
    zIndex: new Map(),
    opacity: new Map(),
    borderWidth: new Map(),
    source: "tailwind-v3",
  };
  return {
    tokens,
    components: new Set(),
    config: {},
    ...(opts.repoRoot !== undefined && { repoRoot: opts.repoRoot }),
  };
}

function makeFinding(message: string, context?: string): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file: "src/X.tsx", line: 5, column: 12 },
    message,
    ...(context !== undefined && { context }),
  };
}

describe("tokens/no-hardcoded-color classifyConfidence", () => {
  it("returns high when exact hex matches a single token and no alpha", () => {
    const ctx = makeCtx(new Map([["#3b82f6", ["color.brandPrimary"]]]));
    const finding = makeFinding("Hardcoded color value: #3B82F6");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("high");
  });

  it("returns medium when color has an alpha channel (rgba)", () => {
    const ctx = makeCtx(new Map([["rgba(0,0,0,0.5)", ["color.overlay"]]]));
    const finding = makeFinding("Hardcoded color value: rgba(0,0,0,0.5)");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("medium");
  });

  it("returns medium when rgba present even without a token match", () => {
    const ctx = makeCtx(new Map());
    const finding = makeFinding("Hardcoded color value: rgba(255,0,0,0.3)");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("medium");
  });

  it("returns low when no token match exists for the color", () => {
    const ctx = makeCtx(new Map([["#2563eb", ["color.action"]]]));
    const finding = makeFinding("Hardcoded color value: #ff5500");
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("low");
  });
});

describe("tokens/no-hardcoded-color classifyConfidence — token-definition files", () => {
  // Use the repo as the ts-morph root so the rule resolves the fixture files
  // exactly the way it would during a real audit.
  const repoRoot = resolve(__dirname, "../..");
  const tokenDefRel = "tests/rules/fixtures/token-definition.ts";
  const appFileRel = "tests/rules/fixtures/app-with-hardcoded-color.tsx";

  afterEach(() => {
    // Drop the cached Project so independent test files don't carry state.
    getTsMorphProject(repoRoot).clear();
  });

  it("lowers confidence to medium for findings inside a token-definition file", () => {
    const ctx = makeCtx(new Map([["#3b82f6", ["color.primary"]]]), { repoRoot });
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: join(tokenDefRel), line: 5, column: 14 },
      message: "Hardcoded color value: #3b82f6",
    };
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("medium");
  });

  it("keeps confidence high for findings in a normal app file with hardcoded colors", () => {
    const ctx = makeCtx(new Map([["#3b82f6", ["color.primary"]]]), { repoRoot });
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: join(appFileRel), line: 7, column: 24 },
      message: "Hardcoded color value: #3b82f6",
    };
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("high");
  });

  it("falls back to high when repoRoot is absent (graceful degradation)", () => {
    const ctx = makeCtx(new Map([["#3b82f6", ["color.primary"]]]));
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: tokenDefRel, line: 5, column: 14 },
      message: "Hardcoded color value: #3b82f6",
    };
    const result = rule.classifyConfidence!(finding, ctx);
    expect(result).toBe("high");
  });
});

describe("tokens/no-hardcoded-color classifyConfidence — AST role demotion", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "conf-role-"));
  });

  afterEach(() => {
    getTsMorphProject(tmpDir).clear();
  });

  it("demotes canvas fillStyle color to low", () => {
    const src = "function draw(c: CanvasRenderingContext2D){ c.fillStyle = '#ffffff'; }";
    writeFileSync(join(tmpDir, "canvas.ts"), src);
    const idx = src.indexOf("#");
    const col = idx - src.lastIndexOf("\n", idx - 1);
    const ctx = makeCtx(new Map([["#ffffff", ["color.white"]]]), { repoRoot: tmpDir });
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "canvas.ts", line: 1, column: col },
      message: "Hardcoded color value: #ffffff",
    };
    expect(rule.classifyConfidence!(finding, ctx)).toBe("low");
  });

  it("keeps styled color as high (drift — not demoted)", () => {
    const src = "const Box = styled.div({ color: '#2563eb' });";
    writeFileSync(join(tmpDir, "styled.tsx"), src);
    const idx = src.indexOf("#");
    const col = idx - src.lastIndexOf("\n", idx - 1);
    const ctx = makeCtx(new Map([["#2563eb", ["color.action"]]]), { repoRoot: tmpDir });
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "styled.tsx", line: 1, column: col },
      message: "Hardcoded color value: #2563eb",
    };
    expect(rule.classifyConfidence!(finding, ctx)).toBe("high");
  });

  it("keeps unknown role as high (recall guardrail — parse failure never demotes)", () => {
    const ctx = makeCtx(new Map([["#3b82f6", ["color.primary"]]]), { repoRoot: tmpDir });
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      location: { file: "nonexistent.tsx", line: 1, column: 1 },
      message: "Hardcoded color value: #3b82f6",
    };
    expect(rule.classifyConfidence!(finding, ctx)).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// I2 — the hook's demotions must survive the CLI. Since the resolver migration
// the rule sets `confidence` at emit time; `populateConfidence` composes the two
// signals most-conservative-wins, so the hook can still veto. Without that, all
// three deliberate demotions above were dead code on the CLI surface.
// ---------------------------------------------------------------------------
describe("populateConfidence composes the emission verdict with the hook", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "conf-compose-"));
  });

  afterEach(() => {
    getTsMorphProject(tmpDir).clear();
  });

  function auditResultWith(finding: Finding): AuditResult {
    return {
      schemaVersion: 2,
      rulesVersion: "test",
      toolVersion: "test",
      scoringVersion: "scoring-v1",
      repoRoot: tmpDir,
      timestamp: "2026-01-01T00:00:00.000Z",
      stack: [],
      finalScore: 100,
      tier: "excellent",
      axes: [],
      findings: [finding],
    };
  }

  it("keeps a functional-role color at low even when the resolver said exact/high", () => {
    const src = "function draw(c: CanvasRenderingContext2D){ c.fillStyle = '#ffffff'; }";
    writeFileSync(join(tmpDir, "canvas2.ts"), src);
    const idx = src.indexOf("#");
    const col = idx - src.lastIndexOf("\n", idx - 1);
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "warning",
      // What a resolver-backed run emits for an exact token match.
      confidence: "high",
      location: { file: "canvas2.ts", line: 1, column: col },
      message: "Hardcoded color value: #ffffff",
    };
    const ctx = makeCtx(new Map([["#ffffff", ["color.white"]]]), { repoRoot: tmpDir });
    const populated = populateConfidence(auditResultWith(finding), {
      ...ctx,
      components: new Set<string>(),
    });
    expect(populated.findings[0]?.confidence).toBe("low");
  });

  it("does not let the hook promote a novel color above low", () => {
    const src = "const Box = styled.div({ color: '#2563eb' });";
    writeFileSync(join(tmpDir, "styled2.tsx"), src);
    const idx = src.indexOf("#");
    const col = idx - src.lastIndexOf("\n", idx - 1);
    const finding: Finding = {
      ruleId: "tokens/no-hardcoded-color",
      axis: "tokens",
      severity: "info",
      // What a resolver-backed run emits for a `novel` value.
      confidence: "low",
      location: { file: "styled2.tsx", line: 1, column: col },
      message: "Hardcoded color value: #2563eb",
    };
    const ctx = makeCtx(new Map([["#2563eb", ["color.action"]]]), { repoRoot: tmpDir });
    const populated = populateConfidence(auditResultWith(finding), {
      ...ctx,
      components: new Set<string>(),
    });
    expect(populated.findings[0]?.confidence).toBe("low");
  });
});
