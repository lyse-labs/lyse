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
    expect(verifyExact(row(), "#ffffff", g2, createResolver(g2)).verdict).toBe("fp");
  });
  it("rejects a token-definition file as fp", () => {
    expect(verifyExact(row({ file: "src/theme.ts" }), "#3b82f6", g, r()).verdict).toBe("fp");
  });
  it("rejects a non-app zone as fp", () => {
    const g3 = graph({ "src/App.tsx": "ds-source" });
    expect(verifyExact(row(), "#3b82f6", g3, createResolver(g3)).verdict).toBe("fp");
  });
  it("is INDEPENDENT of the finding's confidence (low-confidence row still tp)", () => {
    expect(verifyExact(row({ confidence: "low" }), "#3b82f6", g, r()).verdict).toBe("tp");
  });
});
