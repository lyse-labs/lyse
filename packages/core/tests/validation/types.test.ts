import { describe, it, expect } from "vitest";
import type { OracleAdapter, RuleScore } from "../../validation/types.js";

describe("validation types", () => {
  it("an adapter shape compiles and carries a ruleId + oracleKind", () => {
    const adapter: OracleAdapter = {
      ruleId: "tokens/no-hardcoded-color",
      oracleKind: "construction",
      cleanFixture: () => ({ "src/x.css": ".a { color: var(--c); }" }),
      mutations: [
        { name: "inline-hex", apply: (f) => ({ ...f, "src/x.css": ".a { color: #2563eb; }" }) },
      ],
      metamorphic: [],
    };
    expect(adapter.ruleId).toBe("tokens/no-hardcoded-color");
    expect(adapter.oracleKind).toBe("construction");
  });

  it("a RuleScore carries a confusion matrix and youdensJ", () => {
    const score: RuleScore = {
      ruleId: "tokens/no-hardcoded-color",
      oracleKind: "construction",
      matrix: { tp: 1, fp: 0, tn: 1, fn: 0 },
      youdensJ: 1,
      metamorphicInconsistencies: [],
      mutationsRun: 1,
    };
    expect(score.youdensJ).toBe(1);
  });
});
