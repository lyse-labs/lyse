import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LLMBudget } from "../budget.js";

describe("LLM budget", () => {
  it("allows calls under budget", () => {
    const b = new LLMBudget({
      dailyUsd: 10,
      statePath: join(mkdtempSync(join(tmpdir(), "lyse-")), "budget.json"),
    });
    expect(b.canSpend(2.0)).toBe(true);
    b.record(2.0);
    expect(b.canSpend(3.0)).toBe(true);
  });

  it("blocks when daily cap exceeded", () => {
    const b = new LLMBudget({
      dailyUsd: 10,
      statePath: join(mkdtempSync(join(tmpdir(), "lyse-")), "budget.json"),
    });
    b.record(9.5);
    expect(b.canSpend(1.0)).toBe(false);
  });

  it("resets spent count on day rollover", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "lyse-"));
    const statePath = join(stateDir, "budget.json");
    writeFileSync(statePath, JSON.stringify({ date: "1970-01-01", spentUsd: 9.5 }));
    const b = new LLMBudget({ dailyUsd: 10, statePath });
    expect(b.canSpend(1.0)).toBe(true);
  });

  it("returns zeroed state on corrupted JSON", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "lyse-"));
    const statePath = join(stateDir, "budget.json");
    writeFileSync(statePath, "not-json{{{");
    const b = new LLMBudget({ dailyUsd: 10, statePath });
    expect(b.canSpend(5.0)).toBe(true);
  });
});
