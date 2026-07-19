import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { renderJson } from "../src/reporters/json.js";
import type { AxisScoreV2 } from "../src/scorer-v2-legacy.js";

// fixtures/full-ds is under packages/core/ → up 1 (tests → core), then fixtures/.
const FULL_DS = join(import.meta.dirname, "..", "fixtures", "full-ds");

// NOTE: resolveScoreModel's flag > env > config > default precedence is
// already unit-tested in scorer-dispatch.test.ts. This file only covers the
// end-to-end byte-for-byte reproduction of the OLD v2 scores, the env-var
// path, and determinism — not a re-test of precedence itself.

describe("--score-model v2 escape hatch — byte-for-byte scoring-v1.1 reproduction", () => {
  it("reproduces the locked legacy shape on fixtures/full-ds via the flag", async () => {
    const { result } = await auditDirectory(FULL_DS, { staticOnly: true, scoreModel: "v2" });

    expect(result.schemaVersion).toBe(2);
    expect(result.scoringVersion).toBe("scoring-v1.1");
    expect(result.finalScore).toBe(37);
    expect(result.tier).toBe("Managed");
    expect(result.grade).toEqual({
      grade: "Fail",
      autoFailed: true,
      reasons: ["2 axes scored 0: ai-surface, tokens"],
    });
    expect(result.axes.map((a) => ({ axis: a.axis, score: a.score }))).toEqual([
      { axis: "tokens", score: 0 },
      { axis: "a11y", score: 33 },
      { axis: "components", score: 50 },
      { axis: "stories", score: "N/A" },
      { axis: "ai-surface", score: 0 },
      { axis: "ai-governance", score: 100 },
    ]);

    // v2 axes carry the legacy penalty fields — distinct from v3's 4-field
    // shape. Assert at least one axis still has numeric rateScore/sevPenalty.
    const tokensAxis = result.axes.find((a) => a.axis === "tokens") as AxisScoreV2 | undefined;
    expect(tokensAxis).toBeDefined();
    expect(typeof tokensAxis?.rateScore).toBe("number");
    expect(typeof tokensAxis?.sevPenalty).toBe("number");
  });

  describe("env-var path (LYSE_SCORE_MODEL)", () => {
    const ORIGINAL_ENV = process.env.LYSE_SCORE_MODEL;

    beforeEach(() => {
      delete process.env.LYSE_SCORE_MODEL;
    });

    afterEach(() => {
      if (ORIGINAL_ENV === undefined) {
        delete process.env.LYSE_SCORE_MODEL;
      } else {
        process.env.LYSE_SCORE_MODEL = ORIGINAL_ENV;
      }
    });

    it("LYSE_SCORE_MODEL=v2 (no flag) yields the same locked v2 shape", async () => {
      process.env.LYSE_SCORE_MODEL = "v2";
      try {
        const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
        expect(result.schemaVersion).toBe(2);
        expect(result.scoringVersion).toBe("scoring-v1.1");
        expect(result.finalScore).toBe(37);
      } finally {
        delete process.env.LYSE_SCORE_MODEL;
      }
    });

    it("with the env unset and no flag, the default is v3 (proving the env is what flipped it)", async () => {
      expect(process.env.LYSE_SCORE_MODEL).toBeUndefined();
      const { result } = await auditDirectory(FULL_DS, { staticOnly: true });
      expect(result.schemaVersion).toBe(3);
      expect(result.finalScore).toBe("N/A");
    });
  });

  it("is deterministic: two v2 runs render byte-identical JSON", async () => {
    const { result: first } = await auditDirectory(FULL_DS, { staticOnly: true, scoreModel: "v2" });
    const { result: second } = await auditDirectory(FULL_DS, { staticOnly: true, scoreModel: "v2" });

    expect(renderJson(first)).toBe(renderJson(second));
  });
});
