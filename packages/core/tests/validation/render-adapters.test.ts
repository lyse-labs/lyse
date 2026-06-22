import { describe, it, expect } from "vitest";
import { evaluateRenderAdapter } from "../../validation/render-adapters.js";
import { RenderUnavailableError } from "../../src/render/types.js";

describe("render execution-oracle adapter", () => {
  it("recall: an injected override drift is caught (fn=0); clean not flagged (fp=0)", async () => {
    try {
      const score = await evaluateRenderAdapter();
      expect(score.matrix.fn).toBe(0);
      expect(score.matrix.fp).toBe(0);
      expect(score.youdensJ).toBe(1);
    } catch (e) {
      if (!(e instanceof RenderUnavailableError)) throw e;
    }
  }, 60_000);
});
