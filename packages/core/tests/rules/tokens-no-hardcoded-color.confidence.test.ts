import { join, resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { rule } from "../../src/rules/tokens-no-hardcoded-color.js";
import { getTsMorphProject } from "../../src/parsers/ts-morph-project.js";
import type { Finding, ClassifyContext, TokenMap } from "../../src/types.js";

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
