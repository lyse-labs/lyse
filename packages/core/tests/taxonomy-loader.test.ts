import { describe, it, expect } from "vitest";
import { loadTaxonomy, validateTaxonomy } from "../src/bench/taxonomy-loader.js";

describe("loadTaxonomy", () => {
  it("loads the bundled taxonomy.v3.json", async () => {
    const t = await loadTaxonomy();
    expect(t.schemaVersion).toBe("taxonomy/3.0");
    expect(t.axes.length).toBe(12);
  });

  it("axis weights sum to 100", async () => {
    const t = await loadTaxonomy();
    const sum = t.axes.reduce((acc, a) => acc + a.weight, 0);
    expect(sum).toBe(100);
  });

  it("each axis has an id, title, weight, and subDimensions array", async () => {
    const t = await loadTaxonomy();
    for (const axis of t.axes) {
      expect(axis.id).toMatch(/^[a-z0-9_]+$/);
      expect(typeof axis.title).toBe("string");
      expect(typeof axis.weight).toBe("number");
      expect(Array.isArray(axis.subDimensions)).toBe(true);
    }
  });

  it("validUntil is a valid ISO date in the future-or-now", async () => {
    const t = await loadTaxonomy();
    const validUntil = Date.parse(t.validUntil);
    expect(Number.isNaN(validUntil)).toBe(false);
  });
});

describe("validateTaxonomy", () => {
  it("rejects taxonomy with weights summing != 100", () => {
    expect(() =>
      validateTaxonomy({
        schemaVersion: "taxonomy/3.0",
        validUntil: "2026-09-01T00:00:00Z",
        lastReview: "2026-05-26",
        rotationKeyHash: "0".repeat(64),
        axes: [
          { id: "tokens", title: "Tokens", weight: 50, subDimensions: [] },
          { id: "components", title: "Components", weight: 30, subDimensions: [] },
        ],
      }),
    ).toThrow(/weights/);
  });
});
