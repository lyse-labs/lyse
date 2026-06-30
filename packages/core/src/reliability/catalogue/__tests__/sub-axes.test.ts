import { describe, expect, it } from "vitest";
import { SUB_AXES, getSubAxis } from "../sub-axes.js";
import { ruleObjects } from "../../../rules/registry.js";

const VALID_AXES = new Set(["tokens", "a11y", "components", "stories", "ai-surface", "ai-governance"]);

describe("SUB_AXES catalogue", () => {
  it("contains one sub-axis per shipped rule", () => {
    expect(SUB_AXES.length).toBe(ruleObjects.length);
  });
  it("each id is unique", () => {
    const ids = SUB_AXES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("getSubAxis returns the record by id", () => {
    const sa = getSubAxis("tokens.color");
    expect(sa?.axis).toBe("tokens");
  });
  it("every sub-axis has a status", () => {
    for (const s of SUB_AXES) {
      expect(["stable", "experimental", "disabled"]).toContain(s.status);
    }
  });
  it("every sub-axis declares one of the 5 real scoring axes", () => {
    for (const s of SUB_AXES) {
      expect(VALID_AXES.has(s.axis)).toBe(true);
    }
  });
  it("no sub-axis is promoted to `stable` without calibration evidence", () => {
    for (const s of SUB_AXES) {
      if (s.status === "stable") {
        expect(s.recallWilsonLowerBound, `${s.id}: stable promotion requires recallWilsonLowerBound`).not.toBeNull();
        expect(s.recallWilsonLowerBound).toBeGreaterThanOrEqual(0.9);
        expect(s.lastCalibrated, `${s.id}: stable promotion requires lastCalibrated timestamp`).not.toBeNull();
      }
    }
  });
});

describe("LLM-driven governance sub-axes (Track 4.3)", () => {
  it("no sub-axis is llmDriven (the 5 grader dimensions were retired in sub-project D)", () => {
    expect(SUB_AXES.filter((s) => s.llmDriven)).toHaveLength(0);
  });

  it("every sub-axis is static (llmDriven false)", () => {
    for (const s of SUB_AXES) {
      expect(s.llmDriven, `${s.id} should stay static`).toBe(false);
    }
  });
});
