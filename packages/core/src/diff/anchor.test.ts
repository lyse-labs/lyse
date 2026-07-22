import { describe, it, expect } from "vitest";
import { anchorKey, computeFindingId, findingIdsFor } from "./anchor.js";
import type { Finding } from "../types.js";

function color(file: string, line: number, from: string): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
    location: { file, line, column: 1 }, message: `Hardcoded color value: ${from}`,
    fixGroup: { key: `tokens/no-hardcoded-color::${from}`, from },
  };
}
function structural(file: string, line: number): Finding {
  return {
    ruleId: "components/no-native-shadows", axis: "components", severity: "warning",
    location: { file, line, column: 1 }, message: "native shadow",
  };
}

describe("anchorKey", () => {
  it("uses fixGroup.from as the content bucket", () => {
    expect(anchorKey(color("a.tsx", 10, "#3b82f6"))).toEqual({ file: "a.tsx", rule: "tokens/no-hardcoded-color", bucket: "#3b82f6" });
  });
  it("falls back to '*' when no fixGroup", () => {
    expect(anchorKey(structural("a.tsx", 5))).toEqual({ file: "a.tsx", rule: "components/no-native-shadows", bucket: "*" });
  });
});

describe("computeFindingId", () => {
  it("is stable under line/column shift for the same content bucket", () => {
    const a = computeFindingId(color("a.tsx", 10, "#fff"), 0);
    const b = computeFindingId(color("a.tsx", 999, "#fff"), 0);
    expect(a).toBe(b);
  });
  it("differs by ordinal within a key", () => {
    expect(computeFindingId(color("a.tsx", 10, "#fff"), 0)).not.toBe(computeFindingId(color("a.tsx", 10, "#fff"), 1));
  });
  it("excludes message and severity", () => {
    const f1 = color("a.tsx", 10, "#fff");
    const f2 = { ...f1, message: "totally different", severity: "error" as const };
    expect(computeFindingId(f1, 0)).toBe(computeFindingId(f2, 0));
  });
});

describe("findingIdsFor", () => {
  it("assigns ordinals within a group by (line,column), stable across input order", () => {
    const lo = color("a.tsx", 10, "#fff");
    const hi = color("a.tsx", 20, "#fff");
    const forward = findingIdsFor([lo, hi]);
    const reversed = findingIdsFor([hi, lo]);
    expect(forward.get(lo)).toBe(reversed.get(lo));
    expect(forward.get(hi)).toBe(reversed.get(hi));
    expect(forward.get(lo)).not.toBe(forward.get(hi));
  });
});
