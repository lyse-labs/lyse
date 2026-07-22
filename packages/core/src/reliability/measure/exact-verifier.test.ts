import { describe, it, expect } from "vitest";
import { createResolver } from "../../graph/resolve/index.js";
import { verifyExact } from "./exact-verifier.js";
import type { FindingRow } from "./finding-row.js";
import type { DesignSystemGraph } from "../../graph/types.js";

function graph(zoneByFile: Record<string, "app" | "ds-source">): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: [{ id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }],
    components: [], stories: [], usage: [],
    zones: { byFile: zoneByFile }, extraction: { entries: [], conflicts: [] },
  };
}
function row(over: Partial<FindingRow> = {}): FindingRow {
  return { ruleId: "tokens/no-hardcoded-color", repo: "r", file: "src/App.tsx", line: 3,
    snippet: "", fileType: ".tsx", confidence: "high", ...over };
}

describe("verifyExact", () => {
  const g = graph({ "src/App.tsx": "app", "src/theme.ts": "app" });
  const r = () => createResolver(g);

  it("confirms real exact drift as tp", () => {
    expect(verifyExact(row(), "#3b82f6", g, r()).verdict).toBe("tp");
  });
  it("rejects a trivial value as fp", () => {
    const g2 = { ...g, tokens: [{ id: "c.white", axis: "colors" as const, rawValue: "#ffffff", source: "dtcg" as const }] };
    const label = verifyExact(row(), "#ffffff", g2, createResolver(g2));
    expect(label.verdict).toBe("fp");
    expect(label.reason).toBe("trivial value");
  });
  it("rejects a token-definition file as fp", () => {
    const label = verifyExact(row({ file: "src/theme.ts" }), "#3b82f6", g, r());
    expect(label.verdict).toBe("fp");
    expect(label.reason).toBe("token-definition file");
  });
  it("rejects a non-app zone as fp", () => {
    const g3 = graph({ "src/App.tsx": "ds-source" });
    const label = verifyExact(row(), "#3b82f6", g3, createResolver(g3));
    expect(label.verdict).toBe("fp");
    expect(label.reason).toBe("non-app zone");
  });
  it("is INDEPENDENT of the finding's confidence (low-confidence row still tp)", () => {
    expect(verifyExact(row({ confidence: "low" }), "#3b82f6", g, r()).verdict).toBe("tp");
  });
  it("throws when called with a non-token ruleId", () => {
    expect(() =>
      verifyExact(row({ ruleId: "a11y/essentials" }), "#3b82f6", g, r()),
    ).toThrow();
  });
  it("throws when the literal does not re-resolve to exact on the axis", () => {
    expect(() => verifyExact(row(), "#ff00aa", g, r())).toThrow();
  });
});
