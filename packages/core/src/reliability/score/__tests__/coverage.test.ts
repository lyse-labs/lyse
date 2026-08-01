import { describe, it, expect } from "vitest";
import { axesWithDegradedExtraction } from "../coverage.js";
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

describe("axesWithDegradedExtraction", () => {
  it("marks the tokens axis when the token extractor degraded", () => {
    const axes = axesWithDegradedExtraction(
      report([
        ["tokens", "degraded"],
        ["components", "ok"],
        ["stories", "ok"],
      ]),
    );
    expect([...axes]).toEqual(["tokens"]);
  });

  it("marks components and stories independently", () => {
    const axes = axesWithDegradedExtraction(
      report([
        ["tokens", "ok"],
        ["components", "failed"],
        ["stories", "degraded"],
      ]),
    );
    expect([...axes].sort()).toEqual(["components", "stories"]);
  });

  it("returns an empty set when every extractor is ok", () => {
    const axes = axesWithDegradedExtraction(
      report([
        ["tokens", "ok"],
        ["components", "ok"],
        ["stories", "ok"],
      ]),
    );
    expect(axes.size).toBe(0);
  });

  it("ignores the zones extractor, which feeds no axis of its own", () => {
    const axes = axesWithDegradedExtraction(report([["zones", "degraded"]]));
    expect(axes.size).toBe(0);
  });
});
