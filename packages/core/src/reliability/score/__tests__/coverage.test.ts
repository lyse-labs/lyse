import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { rulesBlockedByDegradedExtraction, EXTRACTOR_SYMBOLS } from "../coverage.js";
import type { ExtractionReport } from "../../../graph/types.js";

function report(
  entries: Array<[ExtractionReport["entries"][number]["extractor"], "ok" | "degraded" | "failed"]>,
): ExtractionReport {
  return {
    conflicts: [],
    entries: entries.map(([extractor, status]) => ({
      extractor,
      status,
      evidence: {},
      remediation: null,
    })),
  };
}

describe("rulesBlockedByDegradedExtraction", () => {
  it("blocks the rules that read the component inventory", () => {
    const blocked = rulesBlockedByDegradedExtraction(report([["components", "degraded"]]));
    expect(blocked.has("stories/coverage")).toBe(true);
    expect(blocked.has("tokens/no-hardcoded-color")).toBe(true);
  });

  it("leaves rules that read source directly alone, even on the same axis", () => {
    const blocked = rulesBlockedByDegradedExtraction(report([["components", "degraded"]]));
    // These read the file under audit, not the inventory. Blanking the whole
    // components axis used to silence them for no reason.
    expect(blocked.has("components/svg-viewbox")).toBe(false);
    expect(blocked.has("components/doc-comments")).toBe(false);
    expect(blocked.has("a11y/icon-decorative-aria")).toBe(false);
  });

  it("blocks nothing when every extractor is ok", () => {
    expect(
      rulesBlockedByDegradedExtraction(
        report([
          ["tokens", "ok"],
          ["components", "ok"],
          ["stories", "ok"],
        ]),
      ).size,
    ).toBe(0);
  });

  it("treats failed the same as degraded", () => {
    expect(rulesBlockedByDegradedExtraction(report([["components", "failed"]])).size).toBeGreaterThan(0);
  });

  it("ignores the zones extractor, which feeds no rule of its own", () => {
    expect(rulesBlockedByDegradedExtraction(report([["zones", "degraded"]])).size).toBe(0);
  });
});

describe("the dependency list cannot silently rot", () => {
  it("every rule that reads an extracted artefact is registered", () => {
    const rulesDir = join(import.meta.dirname, "..", "..", "..", "rules");
    const registered = rulesBlockedByDegradedExtraction(report([["components", "degraded"]]));
    const missing: string[] = [];
    for (const file of readdirSync(rulesDir).filter((f) => f.endsWith(".ts") && !f.includes(".test."))) {
      const src = readFileSync(join(rulesDir, file), "utf8");
      if (!src.includes(EXTRACTOR_SYMBOLS.components!)) continue;
      const id = /lyseRuleId:\s*"([^"]+)"/.exec(src)?.[1];
      if (id === undefined) continue; // shared helper, not a rule
      if (!registered.has(id)) missing.push(`${file} (${id})`);
    }
    expect(missing, "rules reading componentInventory but absent from RULES_BY_EXTRACTOR").toEqual([]);
  });
});
