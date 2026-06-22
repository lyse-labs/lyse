import { describe, it, expect } from "vitest";
import { evaluateAdapter } from "../../validation/run-adapter.js";
import type { OracleAdapter, FixtureFiles } from "../../validation/types.js";

// A fake probe: "flagged" iff the css content contains a '#'. Lets us test the
// evaluator's bookkeeping deterministically without the real audit pipeline.
const fakeProbe = async (files: FixtureFiles): Promise<boolean> =>
  Object.values(files).some((c) => c.includes("#"));

const adapter: OracleAdapter = {
  ruleId: "tokens/no-hardcoded-color",
  oracleKind: "construction",
  cleanFixture: () => ({ "x.css": ".a { color: var(--c); }" }),
  mutations: [
    { name: "hex", apply: (f) => ({ ...f, "x.css": ".a { color: #fff; }" }) },
  ],
  metamorphic: [
    { name: "equiv-clean", a: { "x.css": "var(--c)" }, b: { "x.css": "var(--d)" }, expectViolation: false },
    { name: "broken", a: { "x.css": "#fff" }, b: { "x.css": "var(--c)" }, expectViolation: true },
  ],
};

describe("evaluateAdapter", () => {
  it("scores a perfect detector at J=1 and finds the metamorphic inconsistency", async () => {
    const score = await evaluateAdapter(adapter, fakeProbe);
    expect(score.matrix).toEqual({ tp: 1, fp: 0, tn: 1, fn: 0 });
    expect(score.youdensJ).toBe(1);
    expect(score.mutationsRun).toBe(1);
    // 'broken' pair expects BOTH to flag (expectViolation:true) but b uses var → b not flagged → inconsistency.
    expect(score.metamorphicInconsistencies.map((i) => i.pair)).toEqual(["broken"]);
  });
});
