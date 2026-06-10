import { describe, expect, it } from "vitest";
import { loadTaxonomy } from "../taxonomy-loader.js";

describe("taxonomy v3 governance subDimensions", () => {
  it("still validates (axis weights sum to 100)", async () => {
    await expect(loadTaxonomy()).resolves.toBeDefined();
  });

  it("the governance axis declares the 5 Face-B grader dimensions in order", async () => {
    const tax = await loadTaxonomy();
    const governance = tax.axes.find((a) => a.id === "governance");
    expect(governance).toBeDefined();
    const ids = governance!.subDimensions.map((s) => s.id);
    expect(ids).toEqual([
      "human-control-enforced",
      "voice-anti-anthropomorphism",
      "explanation-quality",
      "risk-classification",
      "value-gate-judgment",
    ]);
  });

  it("governance sub-dimension weights sum to 100", async () => {
    const tax = await loadTaxonomy();
    const governance = tax.axes.find((a) => a.id === "governance");
    const sum = governance!.subDimensions.reduce((acc, s) => acc + s.weight, 0);
    expect(sum).toBe(100);
  });
});
