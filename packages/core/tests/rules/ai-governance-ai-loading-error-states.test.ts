import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  _internal,
} from "../../src/rules/ai-governance-ai-loading-error-states.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

const { detectNamedLoadingWithText, detectAiErrorState } = _internal;

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
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "lyse-loading-error-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
// Unit: detectNamedLoadingWithText
// ---------------------------------------------------------------------------
describe("detectNamedLoadingWithText", () => {
  it("returns true for a component named Generating", () => {
    expect(detectNamedLoadingWithText(
      "export function Generating() { return <span>Generating…</span>; }",
      "Generating"
    )).toBe(true);
  });

  it("returns true for a component named Thinking", () => {
    expect(detectNamedLoadingWithText(
      "export const Thinking = () => <p>Thinking…</p>;",
      "Thinking"
    )).toBe(true);
  });

  it("returns true for AILoading with loadingText prop usage", () => {
    expect(detectNamedLoadingWithText(
      `export function AILoading({ loadingText }: Props) {
  return <div><Spinner /><span>{loadingText}</span></div>;
}`,
      "AILoading"
    )).toBe(true);
  });

  it("returns true for StreamingIndicator", () => {
    expect(detectNamedLoadingWithText(
      `export const StreamingIndicator = () => (
  <div aria-label="Generating response"><Spinner /></div>
);`,
      "StreamingIndicator"
    )).toBe(true);
  });

  it("returns true for AIStatus with paired string child", () => {
    expect(detectNamedLoadingWithText(
      `export const AIStatus = () => <span><Spinner /> Please wait</span>;`,
      "AIStatus"
    )).toBe(true);
  });

  it("returns false for a generic Spinner with no AI name and no loadingText", () => {
    expect(detectNamedLoadingWithText(
      `export function Spinner() { return <svg className="spinner" />; }`,
      "Spinner"
    )).toBe(false);
  });

  it("returns false for LoadingSpinner without paired text", () => {
    expect(detectNamedLoadingWithText(
      `export const LoadingSpinner = () => <div className="spin" />;`,
      "LoadingSpinner"
    )).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: detectAiErrorState
// ---------------------------------------------------------------------------
describe("detectAiErrorState", () => {
  it("returns true for a component named AIError", () => {
    expect(detectAiErrorState(
      `export function AIError({ message }: Props) { return <div>{message}</div>; }`,
      "AIError"
    )).toBe(true);
  });

  it("returns true for GenerationError", () => {
    expect(detectAiErrorState(
      `export const GenerationError = () => <p>Generation failed. Please try again.</p>;`,
      "GenerationError"
    )).toBe(true);
  });

  it("returns true for AI+error compound name like AIGenerationFailed", () => {
    expect(detectAiErrorState(
      `export const AIGenerationFailed = () => <div />;`,
      "AIGenerationFailed"
    )).toBe(true);
  });

  it("returns true for LLMTimeout", () => {
    expect(detectAiErrorState(
      `export const LLMTimeout = () => <p>Request timed out.</p>;`,
      "LLMTimeout"
    )).toBe(true);
  });

  it("returns false for a generic ErrorBoundary", () => {
    expect(detectAiErrorState(
      `export class ErrorBoundary extends React.Component { render() { return null; } }`,
      "ErrorBoundary"
    )).toBe(false);
  });

  it("returns false for a non-error AI component like AILabel", () => {
    expect(detectAiErrorState(
      `export const AILabel = () => <span className="ai-badge">AI</span>;`,
      "AILabel"
    )).toBe(false);
  });
});

// Integration — rule.evaluate
// ---------------------------------------------------------------------------

describe("rule.evaluate — integration", () => {

  // Fixture 1: named loading state (Generating) present, AIError present → info
  it("emits info when both named loading-with-text and AI error state are present", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"),
      `export const AILabel = () => <span>AI</span>;`);
    writeFileSync(join(tmp, "src", "Generating.tsx"),
      `export const Generating = () => <div>Generating response…</div>;`);
    writeFileSync(join(tmp, "src", "AIError.tsx"),
      `export const AIError = ({ msg }: { msg: string }) => <div>{msg}</div>;`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    const sev = result.findings.map((f) => f.severity);
    expect(sev).toContain("info");
    expect(sev.filter((s) => s === "warning")).toHaveLength(0);
    expect(result.opportunities).toBeGreaterThan(0);
  });

  // Fixture 2: AI surface present, no named loading state → warning
  it("emits warning when AI surface present but no named loading state", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"),
      `export const AILabel = () => <span>AI</span>;`);
    writeFileSync(join(tmp, "src", "Spinner.tsx"),
      `export const Spinner = () => <svg className="spin" />;`);
    writeFileSync(join(tmp, "src", "AIError.tsx"),
      `export const AIError = ({ msg }: { msg: string }) => <p>{msg}</p>;`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.some((f) => f.severity === "warning" && f.message.includes("loading"))).toBe(true);
  });

  // Fixture 3: bare-spinner-only — must produce warning (key edge case)
  it("emits warning for bare-spinner-only DS with no named-loading-with-text (bare-spinner-only fails)", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"),
      `export const AILabel = () => <span>AI</span>;`);
    writeFileSync(join(tmp, "src", "LoadingSpinner.tsx"),
      `export const LoadingSpinner = () => <div className="spin" />;`);
    writeFileSync(join(tmp, "src", "AIError.tsx"),
      `export const AIError = () => <p>Generation failed.</p>;`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.some((f) => f.severity === "warning" && f.message.includes("loading"))).toBe(true);
  });

  // Fixture 4: AI surface present, no AI error state → warning
  it("emits warning when AI surface present but no AI-specific error state", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"),
      `export const AILabel = () => <span>AI</span>;`);
    writeFileSync(join(tmp, "src", "Generating.tsx"),
      `export const Generating = () => <div>Generating…</div>;`);
    writeFileSync(join(tmp, "src", "ErrorBoundary.tsx"),
      `export class ErrorBoundary extends React.Component { render() { return null; } }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.some((f) => f.severity === "warning" && f.message.includes("error"))).toBe(true);
  });

  // Fixture 5: Thinking + GenerationError (alternate vocabulary) → info
  it("recognises Thinking and GenerationError vocabulary → info", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AIBadge.tsx"),
      `export const AIBadge = () => <span className="badge">AI</span>;`);
    writeFileSync(join(tmp, "src", "Thinking.tsx"),
      `export const Thinking = () => <p>Thinking…</p>;`);
    writeFileSync(join(tmp, "src", "GenerationError.tsx"),
      `export const GenerationError = () => <div>Unable to generate.</div>;`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.every((f) => f.severity !== "warning")).toBe(true);
    expect(result.findings.some((f) => f.severity === "info")).toBe(true);
  });

  // Fixture 6: StreamingIndicator with loadingText prop → counts as named-with-text
  it("StreamingIndicator with loadingText prop satisfies named-loading-with-text", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"),
      `export const AILabel = () => <span>AI</span>;`);
    writeFileSync(join(tmp, "src", "StreamingIndicator.tsx"),
      `export function StreamingIndicator({ loadingText }: { loadingText: string }) {
  return <div><Spinner /><span>{loadingText}</span></div>;
}`);
    writeFileSync(join(tmp, "src", "AIError.tsx"),
      `export const AIError = ({ msg }: { msg: string }) => <div>{msg}</div>;`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings.filter((f) => f.severity === "warning")).toHaveLength(0);
  });

  // Fixture 7: no AI surface (no AI marker) → no finding
  it("emits nothing when the DS has no AI surface", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "Button.tsx"),
      `export const Button = () => <button>Click</button>;`);
    writeFileSync(join(tmp, "src", "Card.tsx"),
      `export const Card = () => <div />;`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  // Fixture 8: allowlist disables the rule entirely
  it("emits nothing when lyse-disable is present in README", async () => {
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "src", "AILabel.tsx"),
      `export const AILabel = () => <span>AI</span>;`);
    writeFileSync(
      join(tmp, "README.md"),
      `# My DS\nlyse-disable ai-governance/ai-loading-error-states\n`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });
});
