import { describe, it, expect } from "vitest";
import { colorAdapter } from "../../../validation/adapters/tokens-no-hardcoded-color.js";
import { evaluateAdapter } from "../../../validation/run-adapter.js";

describe("colorAdapter end-to-end (real static audit)", () => {
  it("recall is perfect: every injected hardcoded color is caught", async () => {
    const score = await evaluateAdapter(colorAdapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.mutationsRun).toBe(7);
    expect(score.metamorphicInconsistencies).toHaveLength(0);
    expect(score.youdensJ).toBe(1);
  });

  it("clean fixture is not flagged (no false positive on the baseline)", async () => {
    const score = await evaluateAdapter(colorAdapter);
    expect(score.matrix.fp).toBe(0);
  });
}, 60_000);
