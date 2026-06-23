import { describe, it, expect } from "vitest";
import { evaluateAxeAdapter } from "../../validation/axe-adapters.js";
import { RenderUnavailableError } from "../../src/render/types.js";

describe("axe execution-oracle adapter", () => {
  // Construction oracle: a minimal DOM with a KNOWN image-alt violation (TP)
  // vs a clean DOM (TN). Constrained to the image-alt rule so the labels are
  // ground-truth-by-construction and deterministic. Validates Lyse's
  // inject→run→map→detectAxeFindings wiring, not axe-core itself.
  it("J=1: img-without-alt flagged (fn=0), clean img not flagged (fp=0)", async () => {
    try {
      const score = await evaluateAxeAdapter();
      expect(score.matrix.fn).toBe(0);
      expect(score.matrix.fp).toBe(0);
      expect(score.youdensJ).toBe(1);
      expect(score.ruleId).toBe("a11y/runtime-axe");
      expect(score.oracleKind).toBe("execution");
    } catch (e) {
      if (!(e instanceof RenderUnavailableError)) throw e;
    }
  }, 60_000);
});
