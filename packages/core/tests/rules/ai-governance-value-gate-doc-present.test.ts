import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _internal, rule } from "../../src/rules/ai-governance-value-gate-doc-present.js";

const { detectGateLanguage, discoverGateDoc } = _internal;

describe("detectGateLanguage", () => {
  it("matches 'is AI needed' phrasing", () => {
    expect(detectGateLanguage("## Is AI needed?\n- [ ] Does ML outperform a deterministic rule here?")).toBe(true);
  });

  it("matches 'value gate' literal", () => {
    expect(detectGateLanguage("# AI Value Gate\nAnswer the following before shipping.")).toBe(true);
  });

  it("matches 'go/no-go' question framing", () => {
    expect(detectGateLanguage("Go/no-go decision checklist for AI features.")).toBe(true);
  });

  it("matches 'should this be AI' phrasing", () => {
    expect(detectGateLanguage("Should this feature be AI-powered? Justify below.")).toBe(true);
  });

  it("matches 'is AI the right tool'", () => {
    expect(detectGateLanguage("Is AI the right tool for this use case?")).toBe(true);
  });

  it("matches checklist with AI context question", () => {
    expect(detectGateLanguage("- [ ] Can a deterministic rule solve this instead of AI?\n- [ ] Is the data available?")).toBe(true);
  });

  it("does NOT match generic markdown with no gate language", () => {
    expect(detectGateLanguage("# AI Component Guidelines\n\nUse `AILabel` on all generated surfaces.")).toBe(false);
  });

  it("does NOT match '## Why AI-powered components?' (requires ? adjacent to 'ai')", () => {
    expect(detectGateLanguage("## Why AI-powered components?\nUse AILabel on AI-generated content.")).toBe(false);
  });

  it("DOES match 'Why AI?' with ? immediately adjacent", () => {
    expect(detectGateLanguage("## Why AI?\nThis section justifies the AI choice.")).toBe(true);
  });

  it("does NOT match empty string", () => {
    expect(detectGateLanguage("")).toBe(false);
  });

  it("is case-insensitive on keywords", () => {
    expect(detectGateLanguage("IS AI NEEDED FOR THIS FEATURE?")).toBe(true);
    expect(detectGateLanguage("VALUE GATE: answer before you ship.")).toBe(true);
  });
});

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "lyse-vg-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("discoverGateDoc", () => {
  it("finds AI_GOVERNANCE.md at root with gate language", () => {
    writeFileSync(join(tmp, "AI_GOVERNANCE.md"), "# AI Value Gate\nIs AI needed?");
    const result = discoverGateDoc(tmp);
    expect(result).not.toBeNull();
    expect(result?.rel).toBe("AI_GOVERNANCE.md");
    expect(result?.hasGateLanguage).toBe(true);
  });

  it("finds .lyse/ai-value-gate.md", () => {
    mkdirSync(join(tmp, ".lyse"));
    writeFileSync(join(tmp, ".lyse/ai-value-gate.md"), "Value gate checklist: go/no-go");
    const result = discoverGateDoc(tmp);
    expect(result).not.toBeNull();
    expect(result?.rel).toBe(".lyse/ai-value-gate.md");
    expect(result?.hasGateLanguage).toBe(true);
  });

  it("finds docs/ai-governance.md via glob fallback", () => {
    mkdirSync(join(tmp, "docs"), { recursive: true });
    writeFileSync(join(tmp, "docs/ai-governance.md"), "Is AI the right tool?");
    const result = discoverGateDoc(tmp);
    expect(result).not.toBeNull();
    expect(result?.hasGateLanguage).toBe(true);
  });

  it("does NOT treat a generic docs/ai/components.md as a gate doc", () => {
    mkdirSync(join(tmp, "docs/ai"), { recursive: true });
    writeFileSync(join(tmp, "docs/ai/components.md"), "## Why AI-powered components?\nUse AILabel on all generated surfaces.");
    const result = discoverGateDoc(tmp);
    expect(result).toBeNull();
  });

  it("detects doc present but without gate language", () => {
    writeFileSync(join(tmp, "AI_GOVERNANCE.md"), "# AI Guidelines\nUse AILabel consistently.");
    const result = discoverGateDoc(tmp);
    expect(result).not.toBeNull();
    expect(result?.hasGateLanguage).toBe(false);
  });

  it("returns null when no candidate file exists", () => {
    expect(discoverGateDoc(tmp)).toBeNull();
  });
});

type ParsedFiles = Parameters<typeof rule.evaluate>[1];
const emptyParsed = {} as ParsedFiles;

function makeCtx(repoRoot: string) {
  return { repoRoot } as Parameters<typeof rule.evaluate>[0];
}

describe("rule.evaluate — integration", () => {
  it("warns when DS has AI marker component but no value-gate doc", async () => {
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/index.ts"), "export { AILabel } from './ai-label';");
    writeFileSync(join(tmp, "src/AILabel.tsx"), "export function AILabel() {}");
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.ruleId).toBe("ai-governance/value-gate-doc-present");
  });

  it("warns when DS has reserved AI tokens but no value-gate doc", async () => {
    writeFileSync(join(tmp, "tokens.json"), JSON.stringify({ color: { "ai": { primary: "#fff" } } }));
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
  });

  it("emits info when DS has AI surface and a valid value-gate doc", async () => {
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/index.ts"), "export { AILabel } from './ai-label';");
    writeFileSync(join(tmp, "src/AILabel.tsx"), "export function AILabel() {}");
    writeFileSync(join(tmp, "AI_GOVERNANCE.md"), "# AI Value Gate\nIs AI needed for this feature?");
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("AI_GOVERNANCE.md");
  });

  it("warns when value-gate doc exists but lacks gate language", async () => {
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/index.ts"), "export { AILabel } from './ai-label';");
    writeFileSync(join(tmp, "src/AILabel.tsx"), "export function AILabel() {}");
    writeFileSync(join(tmp, "AI_GOVERNANCE.md"), "# AI Guidelines\nUse AILabel consistently.");
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.message).toContain("gate language");
  });

  it("emits no finding when DS has no AI surface", async () => {
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/index.ts"), "export { Button } from './button';");
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  it("discovers value-gate doc in docs/ai-governance.md via name-constrained glob", async () => {
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/index.ts"), "export { AIBadge } from './ai-badge';");
    writeFileSync(join(tmp, "src/AIBadge.tsx"), "export function AIBadge() {}");
    mkdirSync(join(tmp, "docs"), { recursive: true });
    writeFileSync(join(tmp, "docs/ai-governance.md"), "Is AI the right tool?\nGo/no-go checklist.");
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
  });

  it("still warns when docs/ai/components.md contains '## Why AI-powered components?' (no gate credit)", async () => {
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/index.ts"), "export { AILabel } from './ai-label';");
    writeFileSync(join(tmp, "src/AILabel.tsx"), "export function AILabel() {}");
    mkdirSync(join(tmp, "docs/ai"), { recursive: true });
    writeFileSync(join(tmp, "docs/ai/components.md"), "## Why AI-powered components?\nUse AILabel on all generated surfaces.");
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
  });

  it("returns no findings when allowlisted", async () => {
    mkdirSync(join(tmp, "src"));
    writeFileSync(join(tmp, "src/index.ts"), "export { AILabel } from './ai-label';");
    writeFileSync(join(tmp, "src/AILabel.tsx"), "export function AILabel() {}");
    writeFileSync(join(tmp, "README.md"), "lyse-disable ai-governance/value-gate-doc-present");
    const ctx = makeCtx(tmp);
    const result = await rule.evaluate(ctx, emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});
