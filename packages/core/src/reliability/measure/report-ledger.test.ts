import { describe, it, expect } from "vitest";
import { renderLedger } from "./report.js";
import { buildLedger } from "./ledger.js";
import type { LedgerBucket } from "./bucket.js";

const meta = { corpus: "t", commit: "0", measuredAt: "1970-01-01T00:00:00.000Z" };

const gateEligibleBucket: Omit<LedgerBucket, "gateEligible"> = {
  ruleId: "tokens/no-hardcoded-color",
  class: "exact",
  zone: "ds-source",
  n: 40,
  precision: 0.95,
  precisionWilsonLB: 0.91,
  recall: null,
  recallWilsonLB: null,
  labelSource: "auto",
};

const candidateBucket: Omit<LedgerBucket, "gateEligible"> = {
  ruleId: "tokens/no-hardcoded-color",
  class: "novel",
  zone: "app",
  n: 30,
  precision: 0.8,
  precisionWilsonLB: 0.65,
  recall: null,
  recallWilsonLB: null,
  labelSource: "llm-provisional",
};

const notMeasuredBucket: Omit<LedgerBucket, "gateEligible"> = {
  ruleId: "tokens/no-hardcoded-color",
  class: "unresolved",
  zone: "test",
  n: 0,
  precision: null,
  precisionWilsonLB: null,
  recall: null,
  recallWilsonLB: null,
  labelSource: "none",
};

describe("renderLedger", () => {
  it("renders a gate-eligible deterministic bucket with measured/deterministic/gate-eligible markers", () => {
    const ledger = buildLedger([gateEligibleBucket], meta);
    const md = renderLedger(ledger);
    expect(md).toContain("measured 95.0%");
    expect(md).toContain("N=40");
    expect(md).toContain("deterministic");
    expect(md).toContain("gate-eligible");
  });

  it("renders a candidate bucket without ever using measured/deterministic/gate-eligible (honesty)", () => {
    const ledger = buildLedger([candidateBucket], meta);
    const md = renderLedger(ledger);
    expect(md).toContain("candidate estimate ~80.0%");
    expect(md).toContain("N=30");
    expect(md).not.toContain("measured");
    expect(md).not.toContain("deterministic");
    expect(md).not.toContain("gate-eligible");
  });

  it("renders a not-measured bucket with no percentage and no N= count", () => {
    const ledger = buildLedger([notMeasuredBucket], meta);
    const md = renderLedger(ledger);
    expect(md).toContain("not measured");
    expect(md).not.toContain("%");
    expect(md).not.toContain("N=");
  });

  it("returns an empty string for an empty ledger", () => {
    const ledger = buildLedger([], meta);
    expect(renderLedger(ledger)).toBe("");
  });

  it("groups buckets with the same ruleId under exactly one header", () => {
    const ledger = buildLedger([gateEligibleBucket, candidateBucket], meta);
    const md = renderLedger(ledger);
    const headerMatches = md.match(/### tokens\/no-hardcoded-color/g) ?? [];
    expect(headerMatches).toHaveLength(1);
  });
});
