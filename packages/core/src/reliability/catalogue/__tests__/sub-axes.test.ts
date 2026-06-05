import { describe, expect, it } from "vitest";
import { SUB_AXES, getSubAxis } from "../sub-axes.js";

const VALID_AXES = new Set(["tokens", "a11y", "components", "stories", "ai-surface"]);

describe("SUB_AXES catalogue", () => {
  it("contains exactly 16 sub-axes (1 per shipped rule)", () => {
    expect(SUB_AXES.length).toBe(16);
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
});
