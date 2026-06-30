import { describe, expect, it } from "vitest";
import { getRubricDimensions, GUIDELINE_TRACEABILITY_MAP, VALID_GUIDELINE_IDS } from "../rubric.js";
import type { RubricDimension } from "../rubric.js";
import { ruleMap } from "../../rules/registry.js";

describe("getRubricDimensions", () => {
  const dims = getRubricDimensions();

  it("defines exactly 1 governance dimension (the rest retired in sub-project D)", () => {
    expect(dims).toHaveLength(1);
  });

  it("each dimension has a unique key", () => {
    const keys = dims.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every dimension uses the ai-governance axis", () => {
    for (const d of dims) expect(d.axis).toBe("ai-governance");
  });

  it("every dimension ruleId is registered (validator will not drop it)", () => {
    for (const d of dims) {
      expect(ruleMap.has(d.ruleId), `${d.key}: ${d.ruleId} not in ruleMap`).toBe(true);
    }
  });

  it("maps the surviving dimension onto its registered rule id", () => {
    const byKey = new Map<string, RubricDimension>(dims.map((d) => [d.key, d]));
    expect(byKey.get("recovery-flow-behavioral")?.ruleId).toBe("ai-governance/ai-loading-error-states");
  });

  it("recovery-flow-behavioral dimension is behavioral (not a presence re-check)", () => {
    const byKey = new Map<string, RubricDimension>(dims.map((d) => [d.key, d]));
    const dim = byKey.get("recovery-flow-behavioral");
    expect(dim).toBeDefined();
    expect(dim?.key).toBe("recovery-flow-behavioral");
    expect(dim?.axis).toBe("ai-governance");
    expect(dim?.ruleId).toBe("ai-governance/ai-loading-error-states");
    expect(dim?.guidelines.length).toBeGreaterThanOrEqual(1);
    // Prompt must mention recovery affordance and graceful degradation
    expect(dim?.prompt).toMatch(/retry|regenerate|recovery/i);
    expect(dim?.prompt).toMatch(/graceful/i);
    // Must contain evidence-contract substrings
    expect(dim?.prompt).toMatch(/exact code snippet/i);
    expect(dim?.prompt).toMatch(/file path/i);
    expect(dim?.prompt).toMatch(/\{ "findings": \[\] \}/);
  });

  it("each dimension carries the full rubric shape", () => {
    for (const d of dims) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.question.length).toBeGreaterThan(0);
      expect(d.scale.length).toBeGreaterThan(0);
      expect(d.evidence.length).toBeGreaterThan(0);
      expect(d.prompt.length).toBeGreaterThan(0);
      expect(Array.isArray(d.guidelines)).toBe(true);
      expect(d.guidelines.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every prompt forces evidence citation so the Track 4.2 validator can verify", () => {
    for (const d of dims) {
      expect(d.prompt).toMatch(/exact code snippet/i);
      expect(d.prompt).toMatch(/file path/i);
      expect(d.prompt).toMatch(/\{ "findings": \[\] \}/);
    }
  });

  it("is deterministic across calls", () => {
    expect(getRubricDimensions()).toEqual(getRubricDimensions());
  });
});

describe("GUIDELINE_TRACEABILITY_MAP", () => {
  const EXPECTED_KEYS = ["recovery-flow-behavioral"] as const;

  it("covers all surviving dimensions", () => {
    expect(Object.keys(GUIDELINE_TRACEABILITY_MAP).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("every dimension has at least 1 guideline mapping", () => {
    for (const key of EXPECTED_KEYS) {
      const ids = GUIDELINE_TRACEABILITY_MAP[key];
      expect(ids, `${key} must have ≥1 guideline`).toBeDefined();
      expect(ids!.length, `${key} must have ≥1 guideline`).toBeGreaterThanOrEqual(1);
    }
  });

  it("all guideline ids are from the valid canonical set", () => {
    for (const [key, ids] of Object.entries(GUIDELINE_TRACEABILITY_MAP)) {
      for (const id of ids) {
        expect(
          VALID_GUIDELINE_IDS.has(id),
          `${key}: "${id}" is not a valid canonical guideline id`,
        ).toBe(true);
      }
    }
  });

  it("VALID_GUIDELINE_IDS covers HAX G1–G18 and PAIR chapters", () => {
    for (let n = 1; n <= 18; n++) {
      expect(VALID_GUIDELINE_IDS.has(`HAX G${n}`), `HAX G${n} missing from valid set`).toBe(true);
    }
    expect(VALID_GUIDELINE_IDS.has("PAIR Explainability")).toBe(true);
    expect(VALID_GUIDELINE_IDS.has("PAIR Human Control")).toBe(true);
    expect(VALID_GUIDELINE_IDS.has("PAIR Safety")).toBe(true);
    expect(VALID_GUIDELINE_IDS.has("PAIR Feedback")).toBe(true);
    expect(VALID_GUIDELINE_IDS.has("PAIR Augmentation")).toBe(true);
    expect(VALID_GUIDELINE_IDS.has("PAIR Error Recovery")).toBe(true);
  });

  it("traceability map is consistent with getRubricDimensions() guidelines field", () => {
    const dims = getRubricDimensions();
    for (const d of dims) {
      const mapped = GUIDELINE_TRACEABILITY_MAP[d.key];
      expect(mapped, `${d.key} not in traceability map`).toBeDefined();
      expect(d.guidelines).toEqual(mapped);
    }
  });

  it("every dimension prompt cites its guideline id(s)", () => {
    const dims = getRubricDimensions();
    for (const d of dims) {
      const ids = GUIDELINE_TRACEABILITY_MAP[d.key]!;
      for (const id of ids) {
        expect(d.prompt, `${d.key} prompt must cite guideline "${id}"`).toContain(id);
      }
    }
  });
});
