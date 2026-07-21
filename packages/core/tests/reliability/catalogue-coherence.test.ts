import { describe, it, expect } from "vitest";
import { adapters } from "../../validation/adapters/index.js";
import { deriveMeasurement } from "../../src/reliability/catalogue/measure.js";
import { evaluateAdapter, type Probe } from "../../validation/run-adapter.js";
import { ruleReported } from "../../validation/audit-probe.js";
import { SUB_AXES } from "../../src/reliability/catalogue/sub-axes.js";

const EPS = 1e-9;
const close = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < EPS;

/**
 * `tokens/no-hardcoded-shadow`'s published precision/recall
 * (src/reliability/catalogue/sub-axes.ts, `tokens.shadow`) were measured
 * before the Task 8 resolver migration, when the rule always emitted
 * `warning`. Shadows are a pure composite axis — `near` is structurally
 * unreachable (see tokens-no-hardcoded-shadow.ts's `shadowVerdict`) — so a
 * real, off-scale value now resolves `novel` and is honestly reported at
 * `info`, which the default probe (`ruleFlagged`, error/warning only) can no
 * longer see. The rule still SURFACES every known violation, just at lower
 * confidence, so `ruleReported` (any severity) is the correct probe to
 * reproduce the frozen published numbers — this is not a rule this task is
 * allowed to re-measure (sub-axes.ts is frozen; see the Task 8 report).
 */
const PROBE_OVERRIDES: Record<string, Probe> = {
  "tokens/no-hardcoded-shadow": ruleReported,
};

describe("catalogue coherence", () => {
  it("published metrics equal in-repo derived metrics for measured rules", async () => {
    const measured = adapters.filter((a) => (a.falseFriends?.length ?? 0) > 0);
    expect(measured.length, "no rule declares a measurement corpus yet").toBeGreaterThan(0);

    for (const adapter of measured) {
      const score = await evaluateAdapter(adapter, PROBE_OVERRIDES[adapter.ruleId]);
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
