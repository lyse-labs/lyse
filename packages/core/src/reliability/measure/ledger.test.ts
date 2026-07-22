import { describe, it, expect } from "vitest";
import { bucketKey, type LedgerBucket, type RulePrecisionLedger } from "./bucket.js";
import { buildLedger, serializeLedger } from "./ledger.js";

const meta: RulePrecisionLedger["generatedFrom"] = {
  corpus: "test-corpus",
  commit: "abc1234",
  measuredAt: "2026-07-22T00:00:00.000Z",
};

const colorExactAuto: Omit<LedgerBucket, "gateEligible"> = {
  ruleId: "tokens/no-hardcoded-color",
  class: "exact",
  zone: "app",
  n: 42,
  precision: 0.98,
  precisionWilsonLB: 0.91,
  recall: null,
  recallWilsonLB: null,
  labelSource: "auto",
};

describe("buildLedger", () => {
  it("computes gateEligible via gateEligibleFor, never trusting a hand-set value", () => {
    const ledger = buildLedger([colorExactAuto], meta);
    expect(ledger.buckets[0]?.gateEligible).toBe(true);

    const provisional: Omit<LedgerBucket, "gateEligible"> = {
      ...colorExactAuto,
      labelSource: "llm-provisional",
    };
    const ledger2 = buildLedger([provisional], meta);
    expect(ledger2.buckets[0]?.gateEligible).toBe(false);
  });

  it("sorts buckets by bucketKey", () => {
    const spacingExact: Omit<LedgerBucket, "gateEligible"> = {
      ...colorExactAuto,
      ruleId: "tokens/no-hardcoded-spacing",
    };
    const colorNear: Omit<LedgerBucket, "gateEligible"> = {
      ...colorExactAuto,
      class: "near",
    };
    const input = [spacingExact, colorNear, colorExactAuto];

    const expectedOrder = [...input].sort((a, b) =>
      bucketKey(a.ruleId, a.class, a.zone).localeCompare(
        bucketKey(b.ruleId, b.class, b.zone),
      ),
    );

    const ledger = buildLedger(input, meta);
    expect(ledger.buckets.map((b) => bucketKey(b.ruleId, b.class, b.zone))).toEqual(
      expectedOrder.map((b) => bucketKey(b.ruleId, b.class, b.zone)),
    );
  });

  it("returns schemaVersion 1 and the passed-through generatedFrom meta", () => {
    const ledger = buildLedger([colorExactAuto], meta);
    expect(ledger.schemaVersion).toBe(1);
    expect(ledger.generatedFrom).toEqual(meta);
  });
});

describe("serializeLedger", () => {
  it("is byte-stable across repeated calls on the same input", () => {
    const ledger1 = buildLedger([colorExactAuto], meta);
    const ledger2 = buildLedger([colorExactAuto], meta);
    expect(serializeLedger(ledger1)).toBe(serializeLedger(ledger2));
  });

  it("ends with a trailing newline", () => {
    const ledger = buildLedger([colorExactAuto], meta);
    expect(serializeLedger(ledger).endsWith("\n")).toBe(true);
  });

  it("never coerces an unmeasured bucket's null precision to 0 (honesty)", () => {
    const unmeasured: Omit<LedgerBucket, "gateEligible"> = {
      ruleId: "tokens/no-hardcoded-spacing",
      class: "exact",
      zone: "app",
      n: 0,
      precision: null,
      precisionWilsonLB: null,
      recall: null,
      recallWilsonLB: null,
      labelSource: "none",
    };
    const ledger = buildLedger([unmeasured], meta);
    expect(ledger.buckets[0]?.gateEligible).toBe(false);

    const serialized = serializeLedger(ledger);
    expect(serialized).toContain(`"precision": null`);
    expect(serialized).not.toContain(`"precision": 0`);
  });
});
