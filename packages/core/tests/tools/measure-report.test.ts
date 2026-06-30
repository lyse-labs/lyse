import { describe, it, expect } from "vitest";
import { buildReport } from "../../src/reliability/measure/report.js";
import type { RuleMeasurement } from "../../src/reliability/measure/report.js";

const structural_promotable: RuleMeasurement = {
  ruleId: "versioning/changelog-present",
  kind: "structural",
  nSamples: 40,
  precisionMeasured: 0.975,
  precisionWilsonLowerBound: 0.95,
  recallSynthetic: 0.95,
  labelSource: "auto",
  verdict: "not-measured",
};

const detection_llm_provisional: RuleMeasurement = {
  ruleId: "tokens/no-hardcoded-color",
  kind: "detection",
  nSamples: 50,
  precisionMeasured: 0.96,
  precisionWilsonLowerBound: 0.94,
  recallSynthetic: 0.92,
  labelSource: "llm-provisional",
  verdict: "not-measured",
};

const structural_low_precision: RuleMeasurement = {
  ruleId: "ai-surface/mcp-config-present",
  kind: "structural",
  nSamples: 30,
  precisionMeasured: 0.6,
  precisionWilsonLowerBound: 0.45,
  recallSynthetic: 0.6,
  labelSource: "auto",
  verdict: "not-measured",
};

const render_only: RuleMeasurement = {
  ruleId: "tokens/rendered-token-fidelity",
  kind: "render-only",
  nSamples: 20,
  precisionMeasured: 0.98,
  precisionWilsonLowerBound: 0.96,
  recallSynthetic: 0.97,
  labelSource: "auto",
  verdict: "not-measured",
};

const zero_samples: RuleMeasurement = {
  ruleId: "ai-surface/agents-md-quality",
  kind: "structural",
  nSamples: 0,
  precisionMeasured: null,
  precisionWilsonLowerBound: null,
  recallSynthetic: null,
  labelSource: "none",
  verdict: "not-measured",
};

describe("buildReport", () => {
  it("assigns 'promotable' to a structural rule with precLB ≥ 0.90 + recall ≥ 0.90 + labelSource=auto", () => {
    const { json } = buildReport([structural_promotable]);
    expect(json[0]?.verdict).toBe("promotable");
  });

  it("assigns 'pending-human' to a detection rule with labelSource=llm-provisional even at high precision", () => {
    const { json } = buildReport([detection_llm_provisional]);
    expect(json[0]?.verdict).toBe("pending-human");
  });

  it("assigns 'walled' to a measured rule with low precisionWilsonLowerBound", () => {
    const { json } = buildReport([structural_low_precision]);
    expect(json[0]?.verdict).toBe("walled");
  });

  it("assigns 'not-measured' to a render-only rule regardless of precision/recall", () => {
    const { json } = buildReport([render_only]);
    expect(json[0]?.verdict).toBe("not-measured");
  });

  it("assigns 'not-measured' to a structural rule with nSamples=0", () => {
    const { json } = buildReport([zero_samples]);
    expect(json[0]?.verdict).toBe("not-measured");
  });

  it("json is sorted by ruleId", () => {
    const { json } = buildReport([
      structural_promotable,
      detection_llm_provisional,
      render_only,
      structural_low_precision,
      zero_samples,
    ]);
    const ids = json.map((m) => m.ruleId);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it("md contains a section per verdict present", () => {
    const { md } = buildReport([
      structural_promotable,
      detection_llm_provisional,
      render_only,
      structural_low_precision,
    ]);
    expect(md).toContain("## promotable");
    expect(md).toContain("## pending-human");
    expect(md).toContain("## walled");
    expect(md).toContain("## not-measured");
  });

  it("md lists ruleIds within each verdict section", () => {
    const { md } = buildReport([structural_promotable, detection_llm_provisional]);
    expect(md).toContain("versioning/changelog-present");
    expect(md).toContain("tokens/no-hardcoded-color");
  });

  it("omits verdict sections with zero members", () => {
    const { md } = buildReport([structural_promotable]);
    expect(md).toContain("## promotable");
    expect(md).not.toContain("## pending-human");
    expect(md).not.toContain("## walled");
  });

  it("llm-provisional is NEVER promotable", () => {
    const highPrecisionLlm: RuleMeasurement = {
      ...detection_llm_provisional,
      precisionWilsonLowerBound: 0.99,
      recallSynthetic: 0.99,
    };
    const { json } = buildReport([highPrecisionLlm]);
    expect(json[0]?.verdict).not.toBe("promotable");
    expect(json[0]?.verdict).toBe("pending-human");
  });
});
