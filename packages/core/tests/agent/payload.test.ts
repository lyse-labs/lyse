import { describe, it, expect } from "vitest";
import { buildHandoffPayload, serializeTokenMap } from "../../src/agent/payload.js";
import type { Finding, TokenMap } from "../../src/types.js";

const findings: Finding[] = [
  { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
    location: { file: "src/Button.tsx", line: 14, column: 1 }, message: "Hardcoded color #3B82F6",
    suggestion: "consider replacing with token color.action.primary" },
  { ruleId: "a11y/prefers-reduced-motion", axis: "a11y", severity: "error",
    location: { file: "globals.css", line: 1, column: 1 }, message: "No reduced-motion guard" },
];

describe("buildHandoffPayload", () => {
  it("groups by rule, orders error before warning, and includes file:line + suggestion", () => {
    const out = buildHandoffPayload(findings, { projectName: "acme", topN: 5, maxFilesPerRule: 3 });
    expect(out).toContain("acme");
    expect(out.indexOf("a11y/prefers-reduced-motion")).toBeLessThan(out.indexOf("tokens/no-hardcoded-color"));
    expect(out).toContain("src/Button.tsx:14");
    expect(out).toContain("color.action.primary");
    expect(out).toContain("don't commit");
    expect(out).toContain("lyse audit");
  });
});

describe("buildHandoffPayload — drift-class grouping", () => {
  const drift: Finding[] = [
    { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "src/A.tsx", line: 3, column: 1 }, message: "Hardcoded color value: #3b82f6",
      fixGroup: { key: "tokens/no-hardcoded-color::#3b82f6", from: "#3b82f6", to: "color.brand.primary" } },
    { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "src/B.tsx", line: 9, column: 1 }, message: "Hardcoded color value: #3b82f6",
      fixGroup: { key: "tokens/no-hardcoded-color::#3b82f6", from: "#3b82f6", to: "color.brand.primary" } },
    { ruleId: "tokens/no-hardcoded-color", axis: "tokens", severity: "warning",
      location: { file: "src/C.tsx", line: 1, column: 1 }, message: "Hardcoded color value: #ff0000",
      fixGroup: { key: "tokens/no-hardcoded-color::#ff0000", from: "#ff0000" } },
  ];

  it("collapses same-value findings into one group with the resolved mapping", () => {
    const out = buildHandoffPayload(drift, { projectName: "acme", topN: 5, maxFilesPerRule: 3 });
    expect(out).toContain("#3b82f6 → color.brand.primary");
    expect(out).toContain("one fix · 2 sites");
    expect(out).toContain("src/A.tsx:3");
    expect(out).toContain("src/B.tsx:9");
  });

  it("keeps distinct values as distinct groups and never guesses an unresolved token", () => {
    const out = buildHandoffPayload(drift, { projectName: "acme", topN: 5, maxFilesPerRule: 3 });
    expect(out).toContain("#ff0000");
    expect(out).not.toContain("#ff0000 →"); // no token resolved → no arrow
  });
});

describe("serializeTokenMap", () => {
  it("turns Maps into plain objects and tolerates null", () => {
    expect(serializeTokenMap(null)).toEqual({});
    const t = { source: "dtcg", colors: new Map([["#3b82f6", ["color.action.primary"]]]),
      spacing: new Map(), typography: new Map(), radii: new Map(), shadows: new Map(),
      motion: new Map(), breakpoints: new Map(), zIndex: new Map(), opacity: new Map(), borderWidth: new Map() } as unknown as TokenMap;
    const s = serializeTokenMap(t) as { source: string; colors: Record<string, string[]> };
    expect(s.source).toBe("dtcg");
    expect(s.colors["#3b82f6"]).toEqual(["color.action.primary"]);
  });
});
