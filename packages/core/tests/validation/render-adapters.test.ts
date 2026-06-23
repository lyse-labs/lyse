import { describe, it, expect } from "vitest";
import { evaluateRenderAdapter } from "../../validation/render-adapters.js";
import { RenderUnavailableError } from "../../src/render/types.js";

describe("render execution-oracle adapter", () => {
  // Empirical finding (verified with real Chromium):
  //   getPropertyValue("--color-bg") for `:root{--brand:#ff0000;--color-bg:var(--brand)}`
  //   returns "#ff0000" — the browser RESOLVES var() references for custom properties.
  //
  // Faithful model:
  //   CANONICAL: buildDtcgCanonicalMap({ color: { bg: { $value: "#ffffff" } } })
  //              → Map { "color/bg" → "#ffffff" }
  //   TN (label=false): CLEAN_CSS = `:root { --color-bg: #ffffff; }`
  //                     computed "#ffffff" == canonical "#ffffff" → not flagged ✓
  //   TP (label=true):  DRIFT_CSS = `:root { --brand: #ff0000; --color-bg: var(--brand); }`
  //                     computed "#ff0000" ≠ canonical "#ffffff" → flagged ✓
  //                     (var-indirection: static-invisible, genuine browser-only mismatch)
  it("J=1: var-indirection drift is caught (fn=0); clean literal not flagged (fp=0)", async () => {
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
