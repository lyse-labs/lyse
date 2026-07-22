import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { gateEligibleFor, type LedgerBucket, type RulePrecisionLedger } from "../../src/reliability/measure/bucket.js";
import { serializeLedger } from "../../src/reliability/measure/ledger.js";

const fixtureUrl = new URL("./fixtures/rules-precision.example.json", import.meta.url);
const raw = readFileSync(fixtureUrl, "utf8");
const parsed = JSON.parse(raw) as RulePrecisionLedger;

describe("rules-precision.example.json (illustrative fixture, not a real measurement)", () => {
  it("has schemaVersion 1", () => {
    expect(parsed.schemaVersion).toBe(1);
  });

  it("has gateEligible computed from gateEligibleFor for every bucket (no hand-edit drift)", () => {
    for (const bucket of parsed.buckets) {
      const { gateEligible, ...rest } = bucket;
      expect(gateEligible).toBe(gateEligibleFor(rest satisfies Omit<LedgerBucket, "gateEligible">));
    }
  });

  it("never coerces an unmeasured bucket's precision to 0 (honesty: null means not-measured)", () => {
    for (const bucket of parsed.buckets) {
      expect(bucket.precision === 0 && bucket.n === 0).toBe(false);
    }
  });

  it("gates only auto-labeled buckets (candidate/human/none never gate-eligible)", () => {
    for (const bucket of parsed.buckets) {
      if (bucket.labelSource !== "auto") {
        expect(bucket.gateEligible).toBe(false);
      }
    }
  });

  it("round-trips through serializeLedger", () => {
    const reserialized = serializeLedger(parsed);
    expect(JSON.parse(reserialized)).toEqual(parsed);
    expect(raw).toBe(reserialized);
  });
});
