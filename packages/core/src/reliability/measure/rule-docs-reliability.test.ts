import { describe, it, expect } from "vitest";
import {
  RELIABILITY_START,
  RELIABILITY_END,
  renderRuleReliability,
  spliceReliabilitySection,
} from "./rule-docs-reliability.js";
import { buildLedger } from "./ledger.js";
import type { LedgerBucket } from "./bucket.js";

const meta = { corpus: "t", commit: "0", measuredAt: "1970-01-01T00:00:00.000Z" };

const ruleId = "tokens/no-hardcoded-color";

const gateEligibleBucket: Omit<LedgerBucket, "gateEligible"> = {
  ruleId,
  class: "exact",
  zone: "ds-source",
  n: 40,
  precision: 0.95,
  precisionWilsonLB: 0.91,
  recall: null,
  recallWilsonLB: null,
  labelSource: "auto",
};

const ledger = buildLedger([gateEligibleBucket], meta);

describe("renderRuleReliability", () => {
  it("returns the not-measured note for a rule with no buckets", () => {
    const body = renderRuleReliability("tokens/no-hardcoded-nonexistent", ledger);
    expect(body).toBe("_No per-class measurement data yet._");
  });

  it("returns bucket lines for a rule with buckets", () => {
    const body = renderRuleReliability(ruleId, ledger);
    expect(body).toContain("measured 95.0%");
    expect(body).toContain("N=40");
  });
});

describe("spliceReliabilitySection", () => {
  it("appends a Reliability section with markers when absent, preserving existing prose", () => {
    const doc = "# tokens/no-hardcoded-color\n\nSome prose.\n";
    const result = spliceReliabilitySection(doc, ruleId, ledger);
    expect(result).toContain("## Reliability");
    expect(result).toContain(RELIABILITY_START);
    expect(result).toContain(RELIABILITY_END);
    expect(result).toContain("measured 95.0%");
    expect(result).toContain("Some prose.");
  });

  it("replaces content between existing markers, leaving surrounding bytes byte-identical", () => {
    const before = "# tokens/no-hardcoded-color\n\nSome prose.\n\n## Reliability\n\n";
    const after = "\n\n## Other section\n\nMore text.\n";
    const doc = `${before}${RELIABILITY_START}\nOLD STALE CONTENT\n${RELIABILITY_END}${after}`;
    const result = spliceReliabilitySection(doc, ruleId, ledger);

    const startIdx = result.indexOf(RELIABILITY_START);
    const endIdx = result.indexOf(RELIABILITY_END);

    expect(result.slice(0, startIdx)).toBe(before);
    expect(result.slice(endIdx + RELIABILITY_END.length)).toBe(after);
    expect(result).not.toContain("OLD STALE CONTENT");
    expect(result).toContain("measured 95.0%");
  });

  it("is idempotent starting from a marker-less doc", () => {
    const doc = "# tokens/no-hardcoded-color\n\nSome prose.\n";
    const once = spliceReliabilitySection(doc, ruleId, ledger);
    const twice = spliceReliabilitySection(once, ruleId, ledger);
    expect(twice).toBe(once);
  });

  it("is idempotent starting from a marker-ful doc", () => {
    const before = "# tokens/no-hardcoded-color\n\nSome prose.\n\n## Reliability\n\n";
    const after = "\n";
    const doc = `${before}${RELIABILITY_START}\nOLD\n${RELIABILITY_END}${after}`;
    const once = spliceReliabilitySection(doc, ruleId, ledger);
    const twice = spliceReliabilitySection(once, ruleId, ledger);
    expect(twice).toBe(once);
  });

  it("produces a not-measured note (no fabricated numbers) for a rule with no buckets", () => {
    const doc = "# tokens/no-hardcoded-nonexistent\n\nSome prose.\n";
    const result = spliceReliabilitySection(doc, "tokens/no-hardcoded-nonexistent", ledger);
    expect(result).toContain("_No per-class measurement data yet._");
    expect(result).not.toContain("%");
  });
});
