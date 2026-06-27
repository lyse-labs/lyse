import { describe, it, expect } from "vitest";
import { runAll } from "../../validation/run.js";
import { adapters } from "../../validation/adapters/index.js";
import { deriveMeasurement } from "../../src/reliability/catalogue/measure.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";

const EPS = 1e-9;
const close = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < EPS;

describe("catalogue coherence", () => {
  it.skip("published metrics equal in-repo derived metrics for measured rules", async () => {
    const measured = adapters.filter((a) => (a.falseFriends?.length ?? 0) > 0);
    expect(measured.length, "no rule declares a measurement corpus yet").toBeGreaterThan(0);

    for (const adapter of measured) {
      const score = await evaluateAdapter(adapter);
      const m = deriveMeasurement(score.matrix);
      const sub = SUB_AXES.find((s) => s.ruleIds.includes(adapter.ruleId));
      expect(sub, `no sub-axis for ${adapter.ruleId}`).toBeDefined();
      if (!sub) continue;
      expect(close(sub.precisionMeasured, m.precisionMeasured), `${sub.id} precision`).toBe(true);
      expect(close(sub.recallMeasured, m.recallMeasured), `${sub.id} recall`).toBe(true);
      expect(close(sub.precisionWilsonLowerBound, m.precisionWilsonLowerBound), `${sub.id} precision LB`).toBe(true);
      expect(close(sub.recallWilsonLowerBound, m.recallWilsonLowerBound), `${sub.id} recall LB`).toBe(true);
      expect(sub.nSamples, `${sub.id} N`).toBe(m.nSamples);
    }
  });
});
