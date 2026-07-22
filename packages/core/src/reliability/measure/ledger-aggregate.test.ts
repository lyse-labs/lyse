import { describe, it, expect } from "vitest";
import { aggregateBuckets, classifyTokenFinding, type LedgerRow } from "./ledger-aggregate.js";
import { wilsonLowerBound } from "../catalogue/promotion.js";
import { createResolver } from "../../graph/resolve/index.js";
import type { DesignSystemGraph } from "../../graph/types.js";

function graph(zoneByFile: Record<string, "app" | "ds-source" | "story">): DesignSystemGraph {
  return {
    schemaVersion: 1,
    tokens: [{ id: "color.brand", axis: "colors", rawValue: "#3b82f6", source: "dtcg" }],
    components: [],
    stories: [],
    usage: [],
    zones: { byFile: zoneByFile },
    extraction: { entries: [], conflicts: [] },
  };
}

function exactRow(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    ruleId: "tokens/no-hardcoded-color",
    class: "exact",
    zone: "app",
    exactVerdict: "tp",
    ...over,
  };
}

describe("aggregateBuckets", () => {
  it("aggregates an exact bucket into precision + wilsonLB + auto labelSource", () => {
    const rows: LedgerRow[] = [
      ...Array.from({ length: 38 }, () => exactRow({ exactVerdict: "tp" })),
      ...Array.from({ length: 2 }, () => exactRow({ exactVerdict: "fp" })),
    ];
    const [b] = aggregateBuckets(rows);
    expect(b).toBeDefined();
    expect(b!.ruleId).toBe("tokens/no-hardcoded-color");
    expect(b!.class).toBe("exact");
    expect(b!.zone).toBe("app");
    expect(b!.n).toBe(40);
    expect(b!.precision).toBeCloseTo(0.95, 5);
    expect(b!.precisionWilsonLB).toBeCloseTo(wilsonLowerBound(38, 40), 10);
    expect(b!.labelSource).toBe("auto");
    expect(b!.recall).toBeNull();
    expect(b!.recallWilsonLB).toBeNull();
  });

  it("splits buckets by (ruleId, class, zone)", () => {
    const rows: LedgerRow[] = [
      exactRow({ zone: "app" }),
      exactRow({ zone: "app" }),
      exactRow({ zone: "story" }),
      { ruleId: "tokens/no-hardcoded-spacing", class: "near", zone: "app" },
    ];
    const buckets = aggregateBuckets(rows);
    expect(buckets).toHaveLength(3);
    const appExact = buckets.find((b) => b.class === "exact" && b.zone === "app");
    expect(appExact!.n).toBe(2);
    const storyExact = buckets.find((b) => b.class === "exact" && b.zone === "story");
    expect(storyExact!.n).toBe(1);
  });

  it("records a candidate (near/novel/unresolved) bucket honestly: n counted, precision null, labelSource none", () => {
    const rows: LedgerRow[] = Array.from({ length: 30 }, () => ({
      ruleId: "tokens/no-hardcoded-color",
      class: "near" as const,
      zone: "app" as const,
    }));
    const [b] = aggregateBuckets(rows);
    expect(b!.class).toBe("near");
    expect(b!.n).toBe(30);
    expect(b!.precision).toBeNull();
    expect(b!.precisionWilsonLB).toBeNull();
    expect(b!.labelSource).toBe("none");
  });

  it("an all-fp exact bucket is precision 0 with n>0 (not null — it WAS measured)", () => {
    const rows: LedgerRow[] = Array.from({ length: 5 }, () => exactRow({ exactVerdict: "fp" }));
    const [b] = aggregateBuckets(rows);
    expect(b!.n).toBe(5);
    expect(b!.precision).toBe(0);
    expect(b!.labelSource).toBe("auto");
  });
});

describe("classifyTokenFinding", () => {
  const g = graph({ "src/App.tsx": "app", "src/theme.ts": "app", "src/Btn.stories.tsx": "story" });

  it("returns null for a non-token rule", () => {
    expect(classifyTokenFinding("a11y/essentials", "src/App.tsx", 1, "#3b82f6", g, createResolver(g))).toBeNull();
  });

  it("classifies an exact app literal as exact/app with a tp verdict", () => {
    const row = classifyTokenFinding("tokens/no-hardcoded-color", "src/App.tsx", 3, "#3b82f6", g, createResolver(g));
    expect(row).toEqual({ ruleId: "tokens/no-hardcoded-color", class: "exact", zone: "app", exactVerdict: "tp" });
  });

  it("classifies an exact literal in a token-def file as exact with an fp verdict", () => {
    const row = classifyTokenFinding("tokens/no-hardcoded-color", "src/theme.ts", 3, "#3b82f6", g, createResolver(g));
    expect(row?.class).toBe("exact");
    expect(row?.exactVerdict).toBe("fp");
  });

  it("classifies an exact literal in a story zone as exact/story with an fp verdict (non-app)", () => {
    const row = classifyTokenFinding("tokens/no-hardcoded-color", "src/Btn.stories.tsx", 3, "#3b82f6", g, createResolver(g));
    expect(row?.class).toBe("exact");
    expect(row?.zone).toBe("story");
    expect(row?.exactVerdict).toBe("fp");
  });

  it("classifies an unrelated literal as novel with no verdict", () => {
    const row = classifyTokenFinding("tokens/no-hardcoded-color", "src/App.tsx", 3, "#ff00aa", g, createResolver(g));
    expect(row?.class).toBe("novel");
    expect(row?.exactVerdict).toBeUndefined();
  });
});
