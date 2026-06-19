import { describe, it, expect } from "vitest";
import { fixWrapAiToken } from "../../src/codemods/ai-token-requires-marker.js";
import type { CodemodInput } from "../../src/codemods/index.js";

function makeInput(source: string): CodemodInput {
  return {
    source,
    path: "src/AnswerCard.tsx",
    finding: {
      ruleId: "ai-governance/ai-token-requires-marker",
      axis: "ai-governance",
      severity: "error",
      location: { file: "src/AnswerCard.tsx", line: 1, column: 1 },
      message: "Component uses reserved AI token(s) but renders no AI-marker",
    },
    ctx: { tokens: { colors: new Map(), spacing: new Map() }, components: new Set(), config: {} },
  } as unknown as CodemodInput;
}

describe("fixWrapAiToken", () => {
  it("inserts data-ai on the single-line opening tag of a single reserved-token element (high confidence)", () => {
    // --ai-gradient-start is genuinely reserved (ai + gradient = AI-distinctive)
    const src = `export const C = () => <div style={{ background: "var(--ai-gradient-start)" }}>{a}</div>;`;
    const res = fixWrapAiToken(makeInput(src));
    expect(res.confidence).toBeGreaterThanOrEqual(0.8);
    expect(res.patch).toContain("<div data-ai style=");
  });

  it("NO_FIX when two reserved-token references (ambiguous)", () => {
    // --ai-gradient-start and --ai-aura-end are both genuinely reserved
    const src = `<div style={{ color: "var(--ai-aura-end)", background: "var(--ai-gradient-start)" }} />`;
    const res = fixWrapAiToken(makeInput(src));
    expect(res.patch).toBeNull();
    expect(res.confidence).toBe(0);
  });

  it("NO_FIX (idempotent) when the tag already has data-ai", () => {
    const src = `<div data-ai style={{ background: "var(--ai-gradient-start)" }} />`;
    expect(fixWrapAiToken(makeInput(src)).patch).toBeNull();
  });

  it("NO_FIX when the reserved token is not inside a single-line opening tag", () => {
    // The token is in a template literal on line 1, not in a JSX tag on that line
    const src = "const x = `var(--ai-gradient-start)`;\nexport const C = () => <div>{x}</div>;";
    expect(fixWrapAiToken(makeInput(src)).patch).toBeNull();
  });

  it("NO_FIX when no reserved token is present", () => {
    // --color-fg is not a reserved AI token
    expect(fixWrapAiToken(makeInput(`<div style={{ color: "var(--color-fg)" }} />`)).patch).toBeNull();
  });

  it("single var(--ai-gradient-start) counts as ONE ref (dedup) so it is fixable", () => {
    // var(--ai-gradient-start) contains a bare --ai-gradient-start inside it.
    // reservedTokenRefOffsets must dedup so only one offset is returned → fixable.
    const src = `export const C = () => <div style={{ background: "var(--ai-gradient-start)" }}>{a}</div>;`;
    const res = fixWrapAiToken(makeInput(src));
    expect(res.patch).not.toBeNull();
    expect(res.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
