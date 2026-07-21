import { describe, it, expect } from "vitest";
import { createResolver } from "./index.js";
import type { DesignSystemGraph } from "../types.js";

const EMPTY: DesignSystemGraph = {
  schemaVersion: 1,
  tokens: [],
  components: [],
  stories: [],
  usage: [],
  zones: { byFile: {} },
  extraction: { entries: [], conflicts: [] },
};

describe("resolver construction", () => {
  it("is safe on an empty graph", () => {
    const r = createResolver(EMPTY);
    expect(r.resolve("colors", "#ffffff").class).toBe("novel");
    expect(r.abstentions()).toBe(0);
  });

  it("starts every audit with a zero abstention count", () => {
    expect(createResolver(EMPTY).abstentions()).toBe(0);
  });
});
