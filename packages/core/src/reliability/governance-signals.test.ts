import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractGovernanceSignals } from "./governance-signals.js";

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-gov-signals-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

describe("extractGovernanceSignals", () => {
  it("all false for a no-AI repo", () => {
    const dir = repo({ "src/Button.tsx": "export function Button() { return null; }" });
    const s = extractGovernanceSignals(dir);
    expect(s.hasMarkerComponent).toBe(false);
    expect(s.hasReservedAiTokens).toBe(false);
    expect(s.hasInteractionAffordance).toBe(false);
    expect(s.hasGovernanceAffordance).toBe(false);
  });

  it("detects a marker component", () => {
    const dir = repo({ "src/AILabel.tsx": "export function AILabel() { return null; }" });
    expect(extractGovernanceSignals(dir).hasMarkerComponent).toBe(true);
  });

  it("detects an AI loading-state interaction affordance", () => {
    const dir = repo({
      "src/AILabel.tsx": "export function AILabel() { return null; }",
      "src/AIGenerating.tsx":
        "export function AIGenerating() { return <div>Generating…</div>; }",
    });
    expect(extractGovernanceSignals(dir).hasInteractionAffordance).toBe(true);
  });

  it("detects an AI live-region interaction affordance", () => {
    const dir = repo({
      "src/AIAnswer.tsx":
        'export function AIAnswer() { return <div role="status"><AILabel/>answer</div>; }',
    });
    expect(extractGovernanceSignals(dir).hasInteractionAffordance).toBe(true);
  });

  it("does not credit interaction affordance without an AI context", () => {
    const dir = repo({
      "src/Toast.tsx": 'export function Toast() { return <div role="status">saved</div>; }',
    });
    expect(extractGovernanceSignals(dir).hasInteractionAffordance).toBe(false);
  });
});
