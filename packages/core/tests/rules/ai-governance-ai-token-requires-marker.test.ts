import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rule, _internal } from "../../src/rules/ai-governance-ai-token-requires-marker.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const { analyseComponent, isReservedSegment } = _internal;

const emptyParsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };

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

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-ai-token-marker-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Unit: isReservedSegment
// ---------------------------------------------------------------------------
describe("isReservedSegment", () => {
  it("matches --ai-primary", () => {
    expect(isReservedSegment("--ai-primary")).toBe(true);
  });

  it("matches --p-color-bg-magic", () => {
    expect(isReservedSegment("--p-color-bg-magic")).toBe(true);
  });

  it("matches color.ai.primary (dot path)", () => {
    expect(isReservedSegment("color.ai.primary")).toBe(true);
  });

  it("matches dragon-fruit", () => {
    expect(isReservedSegment("dragon-fruit")).toBe(true);
  });

  it("does NOT match --color-primary (no ai segment)", () => {
    expect(isReservedSegment("--color-primary")).toBe(false);
  });

  it("does NOT match --rain-color (ai substring in 'rain' is not a segment)", () => {
    expect(isReservedSegment("--rain-color")).toBe(false);
  });

  it("does NOT match color.captain (captain contains 'ai' but not as a segment)", () => {
    expect(isReservedSegment("color.captain")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: analyseComponent
// ---------------------------------------------------------------------------
describe("analyseComponent", () => {
  // Fixture 1: token used + marker present → high confidence, no violation
  it("detects token + JSX marker → hasAiMarker=true, high confidence", () => {
    const src = `
      import { AILabel } from './ai-label';
      const AICard = () => (
        <div style={{ background: 'var(--ai-gradient)' }}>
          <AILabel>AI</AILabel>
        </div>
      );
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(true);
    expect(result.hasAiMarker).toBe(true);
    expect(result.confidence).toBe("high");
  });

  // Fixture 2: token used + no marker → violation, high confidence
  it("detects token without marker → hasAiMarker=false, high confidence", () => {
    const src = `
      const AICard = () => (
        <div style={{ background: 'var(--ai-gradient)' }}>
          {content}
        </div>
      );
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(true);
    expect(result.hasAiMarker).toBe(false);
    expect(result.confidence).toBe("high");
  });

  // Fixture 3: no AI token → no violation
  it("no token usage → usesReservedToken=false", () => {
    const src = `
      const Card = () => (
        <div style={{ color: 'var(--color-primary)' }}>{content}</div>
      );
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(false);
    expect(result.hasAiMarker).toBe(false);
  });

  // Fixture 4: data-ai attribute counts as marker
  it("data-ai attribute is a valid marker", () => {
    const src = `
      const Answer = () => (
        <div data-ai style={{ background: 'var(--p-color-bg-magic)' }}>
          {answer}
        </div>
      );
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(true);
    expect(result.hasAiMarker).toBe(true);
    expect(result.confidence).toBe("high");
  });

  // Fixture 5: dot-path only → LOW confidence (ambiguous)
  it("dot-path token reference only → low confidence (suppressed by default)", () => {
    const src = `
      import tokens from './tokens';
      const val = tokens.color.ai.primary;
      const Card = () => <div>{val}</div>;
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(true);
    expect(result.hasAiMarker).toBe(false);
    expect(result.confidence).toBe("low");
  });

  // Fixture 6: nested marker (AIBadge inside conditional render)
  it("recognises AIBadge nested inside conditional render", () => {
    const src = `
      const AIResult = ({ showBadge }) => (
        <div style={{ background: 'var(--ai-surface)' }}>
          {showBadge && <AIBadge />}
          {content}
        </div>
      );
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(true);
    expect(result.hasAiMarker).toBe(true);
  });

  // Fixture 7: multiple AI tokens, no marker
  it("reports all token refs when multiple reserved tokens present", () => {
    const src = `
      const AIPanel = () => (
        <div style={{
          background: 'var(--ai-surface)',
          border: '1px solid var(--ai-accent)',
        }}>
          {content}
        </div>
      );
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(true);
    expect(result.tokenRefs.length).toBeGreaterThanOrEqual(2);
    expect(result.hasAiMarker).toBe(false);
    expect(result.confidence).toBe("high");
  });

  // Fixture 8: magic-prefixed JSX tag counts as marker
  it("magic-* JSX tag is a valid AI-marker", () => {
    const src = `
      const Card = () => (
        <div style={{ background: 'var(--p-color-bg-magic)' }}>
          <magic-icon />
          {content}
        </div>
      );
    `;
    const result = analyseComponent(src);
    expect(result.usesReservedToken).toBe(true);
    expect(result.hasAiMarker).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: rule.evaluate
// ---------------------------------------------------------------------------
describe("rule ai-governance/ai-token-requires-marker", () => {
  // Fixture 1: token + marker → pass (no finding)
  it("emits no finding when component uses AI token and renders AILabel", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#0875e1" } } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "AICard.tsx"),
      `import { AILabel } from './ai-label';
const AICard = () => (
  <div style={{ background: 'var(--ai-gradient)' }}>
    <AILabel>AI</AILabel>
    {content}
  </div>
);`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 2: token + no marker → error
  it("emits error when component uses AI token with no AI-marker", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#0875e1" } } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "AICard.tsx"),
      `const AICard = () => (
  <div style={{ background: 'var(--ai-surface)' }}>
    {content}
  </div>
);`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.length).toBeGreaterThan(0);
    const f = result.findings[0]!;
    expect(f.severity).toBe("error");
    expect(f.ruleId).toBe("ai-governance/ai-token-requires-marker");
    expect(f.axis).toBe("ai-governance");
    expect(f.message).toContain("--ai-surface");
  });

  // Fixture 3: no reserved tokens in repo → fast-exit, no findings
  it("emits no finding when no reserved tokens are declared in the repo", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { primary: "#0070f3" } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "Card.tsx"),
      `const Card = () => <div style={{ color: 'var(--color-primary)' }}>{content}</div>;`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  // Fixture 4: data-ai attribute → passes (marker via data attribute)
  it("emits no finding when data-ai is present alongside AI token", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#abc" } } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "Answer.tsx"),
      `const Answer = () => (
  <div data-ai style={{ background: 'var(--p-color-bg-magic)' }}>
    {answer}
  </div>
);`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 5: dot-path only → ambiguous, LOW confidence, no finding emitted
  it("suppresses dot-path-only token references (low confidence)", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#abc" } } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "AmbiguousCard.tsx"),
      `import tokens from '../tokens.json';
const val = tokens.color.ai.primary;
const Card = () => <div>{val}</div>;`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 6: nested marker inside conditional → passes
  it("passes when AI-marker is nested inside conditional render", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { surface: "#f0f4ff" } } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "AIResult.tsx"),
      `const AIResult = ({ showBadge }) => (
  <div style={{ background: 'var(--ai-surface)' }}>
    {showBadge && <AIBadge />}
    {content}
  </div>
);`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 7: multiple component files, one violating and one clean
  it("flags only the violating component when multiple files exist", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { surface: "#f0f4ff" } } }),
    );
    mkdirSync(join(tmp, "src"), { recursive: true });
    // Clean component — has AI token + AILabel
    writeFileSync(
      join(tmp, "src", "CleanAICard.tsx"),
      `const CleanAICard = () => (
  <div style={{ background: 'var(--ai-surface)' }}>
    <AILabel>AI</AILabel>
  </div>
);`,
    );
    // Violating component — has AI token, no marker
    writeFileSync(
      join(tmp, "src", "BadAICard.tsx"),
      `const BadAICard = () => (
  <div style={{ background: 'var(--ai-surface)' }}>
    {content}
  </div>
);`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.location.file).toContain("BadAICard");
  });

  // Fixture 8: no repoRoot → returns no findings
  it("returns no findings when repoRoot is not set", async () => {
    const ctx: RuleContext = {
      repoRoot: "",
      tokens: null,
      componentsModule: null,
      componentInventory: [],
      storyIndex: null,
      excludePaths: [],
    };
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 9: Vue SFC with AI token and no marker
  it("detects violation in a Vue SFC using AI token without marker", async () => {
    writeFileSync(
      join(tmp, "tokens.json"),
      JSON.stringify({ color: { ai: { primary: "#abc" } } }),
    );
    mkdirSync(join(tmp, "src", "components"), { recursive: true });
    writeFileSync(
      join(tmp, "src", "components", "AIAnswer.vue"),
      `<template>
  <div :style="{ background: 'var(--ai-surface)' }">
    {{ answer }}
  </div>
</template>`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings[0]!.severity).toBe("error");
  });
});
