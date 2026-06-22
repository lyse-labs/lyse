import { describe, it, expect } from "vitest";
import { componentAdapters } from "../../validation/adapters/component-adapters.js";
import { evaluateAdapter } from "../../validation/run-adapter.js";

const adapterMap = new Map(componentAdapters.map((a) => [a.ruleId, a]));

describe("components/svg-viewbox adapter", () => {
  it("catches every injected missing viewBox (fn=0) and does not flag clean fixture (fp=0)", async () => {
    const adapter = adapterMap.get("components/svg-viewbox")!;
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
    expect(score.youdensJ).toBe(1);
  }, 60_000);
});

describe("naming/component-pascalcase adapter", () => {
  it("catches every injected non-PascalCase component (fn=0) and does not flag clean fixture (fp=0)", async () => {
    const adapter = adapterMap.get("naming/component-pascalcase")!;
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
    expect(score.youdensJ).toBe(1);
  }, 60_000);
});

describe("stories/coverage adapter", () => {
  it("catches a component with no story (fn=0) and does not flag when all have stories (fp=0)", async () => {
    const adapter = adapterMap.get("stories/coverage")!;
    const score = await evaluateAdapter(adapter);
    expect(score.matrix.fn).toBe(0);
    expect(score.matrix.fp).toBe(0);
    expect(score.youdensJ).toBe(1);
  }, 60_000);
});

