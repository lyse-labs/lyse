import { describe, it, expect } from "vitest";
import { gateEligibleFor } from "../../../src/reliability/measure/bucket.js";
import type { LedgerBucket } from "../../../src/reliability/measure/bucket.js";
import type { MinedRecallBucket } from "../../../src/reliability/gold/types.js";

describe("git-mined recall is never gate-eligible", () => {
  it("a git-mined bucket cannot be gate-eligible, even relabelled auto with n >= the gate threshold", () => {
    const b: MinedRecallBucket = {
      ruleId: "tokens/no-hardcoded-color",
      class: "exact",
      zone: "app",
      labels: 40,
      caught: 40,
      recall: 1,
      recallWilsonLB: 0.912,
      recallSource: "git-mined",
    };

    // gateEligibleFor reads {labelSource, n, precisionWilsonLB} off a
    // LedgerBucket. A recall-only bucket has no precision provenance at all
    // -- it structurally cannot supply a non-null precisionWilsonLB -- so
    // relabelling it "auto" and handing it a passing sample size (n=40 >=
    // the MIN_GATE_N=35 threshold) must still fail the gate on the
    // precisionWilsonLB !== null clause alone. This is the real structural
    // guarantee: no relabelling of a git-mined bucket can ever make it
    // gate-eligible, because it has no precision axis to relabel onto.
    const relabelled: Omit<LedgerBucket, "gateEligible"> = {
      ruleId: b.ruleId,
      class: b.class,
      zone: b.zone,
      n: b.labels,
      precision: null,
      precisionWilsonLB: null,
      recall: b.recall,
      recallWilsonLB: b.recallWilsonLB,
      labelSource: "auto",
    };

    expect(relabelled.n).toBeGreaterThanOrEqual(35);
    expect(gateEligibleFor(relabelled)).toBe(false);
    expect(b.recallSource).toBe("git-mined");
  });
});
