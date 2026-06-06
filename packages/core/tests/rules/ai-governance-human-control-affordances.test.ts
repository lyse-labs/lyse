import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  rule,
  detectPerOutputControls,
  detectGlobalAiToggle,
} from "../../src/rules/ai-governance-human-control-affordances.js";
import type { RuleContext, ParsedFiles } from "../../src/types.js";

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
  tmp = mkdtempSync(join(tmpdir(), "lyse-hca-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ────────────────────────────────────────────────────────────────────────────
// Unit: detectPerOutputControls — name-based detection
// ────────────────────────────────────────────────────────────────────────────

describe("detectPerOutputControls — name-based", () => {
  it("detects RegenerateButton by exported name", () => {
    expect(detectPerOutputControls(`export function RegenerateButton() {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "RegenerateButton" })]),
    );
  });

  it("detects StopGenerating by exported name", () => {
    expect(detectPerOutputControls(`export const StopGenerating = () => {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "StopGenerating" })]),
    );
  });

  it("detects EditResponse by exported name", () => {
    expect(detectPerOutputControls(`export function EditResponse() {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "EditResponse" })]),
    );
  });

  it("detects UndoAction by exported name", () => {
    expect(detectPerOutputControls(`export const UndoAction = () => {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "UndoAction" })]),
    );
  });

  it("detects AcceptSuggestion by exported name", () => {
    expect(detectPerOutputControls(`export function AcceptSuggestion() {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "AcceptSuggestion" })]),
    );
  });

  it("detects RejectSuggestion by exported name", () => {
    expect(detectPerOutputControls(`export const RejectSuggestion = () => {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "RejectSuggestion" })]),
    );
  });

  it("detects ConfirmOutput by exported name", () => {
    expect(detectPerOutputControls(`export function ConfirmOutput() {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "ConfirmOutput" })]),
    );
  });

  it("detects DismissResult by exported name", () => {
    expect(detectPerOutputControls(`export const DismissResult = () => {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "DismissResult" })]),
    );
  });

  it("detects RetryRequest by exported name", () => {
    expect(detectPerOutputControls(`export function RetryRequest() {}`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "RetryRequest" })]),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Unit: detectPerOutputControls — label-based detection
// ────────────────────────────────────────────────────────────────────────────

describe("detectPerOutputControls — label-based", () => {
  it("detects a button labeled Regenerate", () => {
    expect(detectPerOutputControls(`<button>Regenerate</button>`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Regenerate" })]),
    );
  });

  it("detects a Button labeled Stop", () => {
    expect(detectPerOutputControls(`<Button>Stop</Button>`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Stop" })]),
    );
  });

  it("detects a button labeled Undo", () => {
    expect(detectPerOutputControls(`<button>Undo</button>`)).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Undo" })]),
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Unit: detectPerOutputControls — negative cases
// ────────────────────────────────────────────────────────────────────────────

describe("detectPerOutputControls — negative", () => {
  it("does NOT flag a non-control component named ReturnPolicy", () => {
    expect(detectPerOutputControls(`export function ReturnPolicy() {}`)).toEqual([]);
  });

  it("does NOT flag a button with a generic label", () => {
    expect(detectPerOutputControls(`<button>Submit</button>`)).toEqual([]);
  });

  it("returns empty array when source has no controls at all", () => {
    expect(detectPerOutputControls(`export function Card() {}`)).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Unit: detectGlobalAiToggle
// ────────────────────────────────────────────────────────────────────────────

describe("detectGlobalAiToggle", () => {
  it("detects AISettings by exported name", () => {
    expect(detectGlobalAiToggle(`export function AISettings() {}`)).toBe(true);
  });

  it("detects AiPreferences by exported name", () => {
    expect(detectGlobalAiToggle(`export const AiPreferences = () => {}`)).toBe(true);
  });

  it("detects DisableAI by exported name", () => {
    expect(detectGlobalAiToggle(`export function DisableAI() {}`)).toBe(true);
  });

  it("detects a toggle labeled 'Disable AI'", () => {
    expect(detectGlobalAiToggle(`<Toggle label="Disable AI" />`)).toBe(true);
  });

  it("detects a toggle labeled 'AI features'", () => {
    expect(detectGlobalAiToggle(`<Switch label="AI features" />`)).toBe(true);
  });

  it("does NOT flag a generic settings component", () => {
    expect(detectGlobalAiToggle(`export function UserSettings() {}`)).toBe(false);
  });

  it("returns false when no global AI toggle present", () => {
    expect(detectGlobalAiToggle(`export function Button() {}`)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Integration: rule.evaluate — 9 fixtures
// ────────────────────────────────────────────────────────────────────────────

describe("rule.evaluate — integration", () => {
  // Fixture 1: AI marker present + RegenerateButton → info, message contains "HAX G8"
  it("fixture 1: AI marker + RegenerateButton → info with HAX G8", async () => {
    writeFileSync(join(tmp, "AIBadge.tsx"), `export function AIBadge() { return <span>AI</span>; }`);
    writeFileSync(join(tmp, "RegenerateButton.tsx"), `export function RegenerateButton() { return <button>Regenerate</button>; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("HAX G8");
    expect(result.findings[0]?.message).toContain("RegenerateButton");
  });

  // Fixture 2: AI marker + AISettings only (no per-output controls) → warning
  it("fixture 2: AI marker + AISettings only → warning (per-output missing)", async () => {
    writeFileSync(join(tmp, "AiBadge.tsx"), `export function AiBadge() { return <span>AI</span>; }`);
    writeFileSync(join(tmp, "AISettings.tsx"), `export function AISettings() { return <div />; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.message).toContain("HAX G8");
  });

  // Fixture 3: AI marker + JSX <button>Stop</button> → info, message contains "HAX G8"
  it("fixture 3: AI marker + button label Stop → info with HAX G8", async () => {
    writeFileSync(
      join(tmp, "AILabel.tsx"),
      `export function AILabel() { return <span>AI</span>; }\nexport function StopButton() { return <button>Stop</button>; }`,
    );
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("HAX G8");
    expect(result.findings[0]?.message).toContain("Stop");
  });

  // Fixture 4: AI marker + ConfirmOutput + DismissResult → info, lists both
  it("fixture 4: AI marker + Confirm + Dismiss → info listing both", async () => {
    writeFileSync(join(tmp, "AIMarker.tsx"), `export function AIMarker() { return <span>AI</span>; }`);
    writeFileSync(join(tmp, "ConfirmOutput.tsx"), `export function ConfirmOutput() { return <button>Confirm</button>; }`);
    writeFileSync(join(tmp, "DismissResult.tsx"), `export function DismissResult() { return <button>Dismiss</button>; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("ConfirmOutput");
    expect(result.findings[0]?.message).toContain("DismissResult");
  });

  // Fixture 5: AI marker + NO controls → warning, message contains "HAX G8" and "HAX G9"
  it("fixture 5: AI marker + no controls → warning with HAX G8 and HAX G9", async () => {
    writeFileSync(join(tmp, "AIBadge.tsx"), `export function AIBadge() { return <span>AI</span>; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
    expect(result.findings[0]?.message).toContain("HAX G8");
    expect(result.findings[0]?.message).toContain("HAX G9");
  });

  // Fixture 6: DisableAI + AI marker, no per-output → warning
  it("fixture 6: DisableAI global toggle + AI marker, no per-output → warning", async () => {
    writeFileSync(join(tmp, "AIBadge.tsx"), `export function AIBadge() { return <span>AI</span>; }`);
    writeFileSync(join(tmp, "DisableAI.tsx"), `export function DisableAI() { return <Toggle label="Disable AI" />; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("warning");
  });

  // Fixture 7: No AI marker → 0 findings
  it("fixture 7: no AI marker → 0 findings", async () => {
    writeFileSync(join(tmp, "Button.tsx"), `export function Button() { return <button>Click</button>; }`);
    writeFileSync(join(tmp, "Card.tsx"), `export function Card() { return <div />; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
  });

  // Fixture 8: allowlist → 0 findings
  it("fixture 8: allowlist disables rule → 0 findings", async () => {
    writeFileSync(join(tmp, "README.md"), `# DS\n\nlyse-disable ai-governance/human-control-affordances\n`);
    writeFileSync(join(tmp, "AIBadge.tsx"), `export function AIBadge() { return <span>AI</span>; }`);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(0);
    expect(result.opportunities).toBe(0);
  });

  // Fixture 9: Vue SFC with AIBadge marker + <button>Undo</button> → info
  it("fixture 9: Vue SFC with AI tag + Undo button → info", async () => {
    const vueSrc = `<template>
  <div>
    <AIBadge />
    <button>Undo</button>
  </div>
</template>
<script>
export default { name: 'AIWidget' };
</script>`;
    writeFileSync(join(tmp, "AIWidget.vue"), vueSrc);
    const result = await rule.evaluate(makeCtx(tmp), emptyParsed);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
    expect(result.findings[0]?.message).toContain("Undo");
  });
});
