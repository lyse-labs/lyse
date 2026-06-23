import { describe, it, expect } from "vitest";
import { runAll } from "../../validation/run.js";
import { colorAdapter } from "../../validation/adapters/tokens-no-hardcoded-color.js";

describe("runAll", () => {
  it("produces a deterministic, alphabetically-sorted report over given adapters", async () => {
    const report = await runAll([colorAdapter]);
    expect(report.scores).toHaveLength(1);
    expect(report.scores[0]!.ruleId).toBe("tokens/no-hardcoded-color");
    expect(typeof report.lyseVersion).toBe("string");
    const report2 = await runAll([colorAdapter]);
    expect(JSON.stringify(report2)).toBe(JSON.stringify(report)); // deterministic
  }, 60_000);
});
