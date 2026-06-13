import { describe, it, expect, vi } from "vitest";
import { runFilterStage } from "../filter-stage.js";
import type { ConnectorClient, ConnectorResult } from "../connectors/types.js";
import type { Finding, LyseConfig } from "../../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MIN_CONFIG: LyseConfig = {};

function makeColorFinding(
  file: string,
  line: number,
  column = 1,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    ruleId: "tokens/no-hardcoded-color",
    axis: "tokens",
    severity: "warning",
    location: { file, line, column },
    message: `Hardcoded color "#ff0000"`,
    context: '"#ff0000"',
    ...overrides,
  };
}

function makeSpacingFinding(
  file: string,
  line: number,
  column = 1,
  overrides: Partial<Finding> = {},
): Finding {
  return {
    ruleId: "tokens/no-hardcoded-spacing",
    axis: "tokens",
    severity: "warning",
    location: { file, line, column },
    message: `Hardcoded spacing "16px"`,
    context: '"16px"',
    ...overrides,
  };
}

function makeOtherFinding(file: string, line: number): Finding {
  return {
    ruleId: "components/no-native-shadows",
    axis: "components",
    severity: "warning",
    location: { file, line, column: 1 },
    message: "No native shadows",
  };
}

function mockConnector(
  responseText: string,
  extra?: Partial<ConnectorResult>,
): ConnectorClient {
  return {
    complete: async () => ({
      text: responseText,
      usdSpent: 0,
      modelUsed: "fake",
      llmQuality: "higher" as const,
      cacheHit: false,
      ...extra,
    }),
  };
}

function verdictJson(verdicts: Array<{ index: number; keep: boolean }>): string {
  return JSON.stringify({ verdicts });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runFilterStage — staticOnly opt-out", () => {
  it("returns unchanged findings and filterRan=false when flags.staticOnly=true (no connector call)", async () => {
    const spy = vi.fn();
    const connector: ConnectorClient = { complete: spy };
    const findings = [makeColorFinding("src/App.tsx", 10)];
    const fileContents = new Map([["src/App.tsx", "const color = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: { staticOnly: true }, findings, fileContents },
      { connector },
    );

    expect(result.meta.filterRan).toBe(false);
    expect(result.meta.filteredCount).toBe(0);
    expect(result.findings).toEqual(findings);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns unchanged findings and filterRan=false when config.llm.staticOnly=true (no connector call)", async () => {
    const spy = vi.fn();
    const connector: ConnectorClient = { complete: spy };
    const findings = [makeColorFinding("src/App.tsx", 10)];
    const fileContents = new Map([["src/App.tsx", "const color = '#ff0000';"]]);
    const config: LyseConfig = { llm: { staticOnly: true } };

    const result = await runFilterStage(
      { repoRoot: "/repo", config, flags: undefined, findings, fileContents },
      { connector },
    );

    expect(result.meta.filterRan).toBe(false);
    expect(result.meta.filteredCount).toBe(0);
    expect(result.findings).toEqual(findings);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("runFilterStage — no target findings", () => {
  it("returns unchanged findings and filterRan=false when no target-rule findings exist (no connector call)", async () => {
    const spy = vi.fn();
    const connector: ConnectorClient = { complete: spy };
    const findings = [makeOtherFinding("src/Button.tsx", 5)];
    const fileContents = new Map([["src/Button.tsx", "export const Button = () => null;"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings, fileContents },
      { connector },
    );

    expect(result.meta.filterRan).toBe(false);
    expect(result.meta.filteredCount).toBe(0);
    expect(result.findings).toEqual(findings);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("runFilterStage — verdicts", () => {
  it("drops a finding when verdict keep=false", async () => {
    const f = makeColorFinding("src/Chart.tsx", 12);
    const connector = mockConnector(verdictJson([{ index: 0, keep: false }]));
    const fileContents = new Map([["src/Chart.tsx", "const chartColor = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toHaveLength(0);
    expect(result.meta.filteredCount).toBe(1);
    expect(result.meta.filterRan).toBe(true);
  });

  it("retains a finding when verdict keep=true", async () => {
    const f = makeColorFinding("src/App.tsx", 5);
    const connector = mockConnector(verdictJson([{ index: 0, keep: true }]));
    const fileContents = new Map([["src/App.tsx", "const bg = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual(f);
    expect(result.meta.filteredCount).toBe(0);
    expect(result.meta.filterRan).toBe(true);
  });

  it("non-target findings always pass through regardless of target finding verdict", async () => {
    const colorF = makeColorFinding("src/Chart.tsx", 12);
    const otherF = makeOtherFinding("src/Button.tsx", 3);
    const connector = mockConnector(verdictJson([{ index: 0, keep: false }]));
    const fileContents = new Map([
      ["src/Chart.tsx", "const chartColor = '#ff0000';"],
      ["src/Button.tsx", "export const Button = () => null;"],
    ]);

    const result = await runFilterStage(
      {
        repoRoot: "/repo",
        config: MIN_CONFIG,
        flags: undefined,
        findings: [colorF, otherF],
        fileContents,
      },
      { connector },
    );

    // color finding dropped, other finding kept
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual(otherF);
    expect(result.meta.filteredCount).toBe(1);
  });

  it("missing verdict index defaults to keep", async () => {
    const f0 = makeColorFinding("src/App.tsx", 1);
    const f1 = makeColorFinding("src/App.tsx", 2);
    // Only verdict for index 0 (keep), no verdict for index 1 → index 1 defaults to keep
    const connector = mockConnector(verdictJson([{ index: 0, keep: true }]));
    const fileContents = new Map([["src/App.tsx", "const a = '#ff0000';\nconst b = '#00ff00';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f0, f1], fileContents },
      { connector },
    );

    expect(result.findings).toHaveLength(2);
    expect(result.meta.filteredCount).toBe(0);
  });

  it("out-of-range verdict index is ignored (keep by default)", async () => {
    const f = makeColorFinding("src/App.tsx", 1);
    // Verdict references index 99 which doesn't exist → ignored
    const connector = mockConnector(verdictJson([{ index: 99, keep: false }]));
    const fileContents = new Map([["src/App.tsx", "const color = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toHaveLength(1);
    expect(result.meta.filteredCount).toBe(0);
  });

  it("filteredCount is correct when multiple findings are dropped across different files", async () => {
    const f1 = makeColorFinding("src/A.tsx", 1);
    const f2 = makeSpacingFinding("src/B.tsx", 2);
    const f3 = makeColorFinding("src/A.tsx", 5); // kept
    // For src/A.tsx: drop index 0 (f1), keep index 1 (f3)
    // For src/B.tsx: drop index 0 (f2)
    const connector: ConnectorClient = {
      complete: vi.fn()
        .mockResolvedValueOnce({
          text: verdictJson([{ index: 0, keep: false }, { index: 1, keep: true }]),
          usdSpent: 0,
          modelUsed: "fake",
          llmQuality: "higher" as const,
          cacheHit: false,
        })
        .mockResolvedValueOnce({
          text: verdictJson([{ index: 0, keep: false }]),
          usdSpent: 0,
          modelUsed: "fake",
          llmQuality: "higher" as const,
          cacheHit: false,
        }),
    };
    const fileContents = new Map([
      ["src/A.tsx", "const a = '#ff0000';\nconst b = '#00ff00';"],
      ["src/B.tsx", "padding: 16px;"],
    ]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f1, f2, f3], fileContents },
      { connector },
    );

    expect(result.meta.filteredCount).toBe(2);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toEqual(f3);
  });

  it("preserves the original order of input.findings after filtering", async () => {
    const f1 = makeColorFinding("src/A.tsx", 1); // kept
    const f2 = makeSpacingFinding("src/B.tsx", 2); // dropped
    const f3 = makeColorFinding("src/A.tsx", 5); // kept
    const f4 = makeOtherFinding("src/C.tsx", 10); // non-target, always kept
    const connector: ConnectorClient = {
      complete: vi.fn()
        // src/A.tsx: keep index 0 (f1), keep index 1 (f3)
        .mockResolvedValueOnce({
          text: verdictJson([{ index: 0, keep: true }, { index: 1, keep: true }]),
          usdSpent: 0,
          modelUsed: "fake",
          llmQuality: "higher" as const,
          cacheHit: false,
        })
        // src/B.tsx: drop index 0 (f2)
        .mockResolvedValueOnce({
          text: verdictJson([{ index: 0, keep: false }]),
          usdSpent: 0,
          modelUsed: "fake",
          llmQuality: "higher" as const,
          cacheHit: false,
        }),
    };
    const fileContents = new Map([
      ["src/A.tsx", "const a = '#ff0000';\nconst b = '#00ff00';"],
      ["src/B.tsx", "padding: 16px;"],
    ]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f1, f2, f3, f4], fileContents },
      { connector },
    );

    expect(result.findings).toEqual([f1, f3, f4]);
  });
});

describe("runFilterStage — empty text bail (Noop / budget exhausted)", () => {
  it("keeps all findings and sets filterRan=false when connector returns empty text", async () => {
    const f = makeColorFinding("src/App.tsx", 10);
    const connector = mockConnector("");
    const fileContents = new Map([["src/App.tsx", "const color = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toEqual([f]);
    expect(result.meta.filterRan).toBe(false);
    expect(result.meta.filteredCount).toBe(0);
  });

  it("stops calling connector for remaining files after empty-text bail", async () => {
    const f1 = makeColorFinding("src/A.tsx", 1);
    const f2 = makeColorFinding("src/B.tsx", 1);
    const completeSpy = vi.fn().mockResolvedValue({
      text: "",
      usdSpent: 0,
      modelUsed: "none",
      llmQuality: "lower" as const,
      cacheHit: false,
    });
    const connector: ConnectorClient = { complete: completeSpy };
    const fileContents = new Map([
      ["src/A.tsx", "const a = '#ff0000';"],
      ["src/B.tsx", "const b = '#00ff00';"],
    ]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f1, f2], fileContents },
      { connector },
    );

    // Only called once (for src/A.tsx), then bailed
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(result.findings).toEqual([f1, f2]);
    expect(result.meta.filterRan).toBe(false);
  });
});

describe("runFilterStage — parse error fail-safe", () => {
  it("keeps all findings for a file when response is not valid JSON", async () => {
    const f = makeColorFinding("src/App.tsx", 10);
    const connector = mockConnector("this is not json {{{{");
    const fileContents = new Map([["src/App.tsx", "const color = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toEqual([f]);
    expect(result.meta.filteredCount).toBe(0);
    // filterRan is true because the response was non-empty (even though unparseable)
    expect(result.meta.filterRan).toBe(true);
  });

  it("keeps all findings for a file when JSON has no verdicts array", async () => {
    const f = makeColorFinding("src/App.tsx", 10);
    const connector = mockConnector(JSON.stringify({ wrong: "shape" }));
    const fileContents = new Map([["src/App.tsx", "const color = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toEqual([f]);
    expect(result.meta.filteredCount).toBe(0);
  });
});

describe("runFilterStage — missing fileContents", () => {
  it("keeps findings for a file when its source is not in fileContents", async () => {
    const spy = vi.fn();
    const connector: ConnectorClient = { complete: spy };
    const f = makeColorFinding("src/App.tsx", 10);
    const fileContents = new Map<string, string>(); // empty

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toEqual([f]);
    expect(spy).not.toHaveBeenCalled();
    expect(result.meta.filteredCount).toBe(0);
    expect(result.meta.filterRan).toBe(false);
  });
});

describe("runFilterStage — JSON in markdown fence", () => {
  it("handles verdicts wrapped in ```json fences", async () => {
    const f = makeColorFinding("src/App.tsx", 10);
    const fencedJson = "```json\n" + verdictJson([{ index: 0, keep: false }]) + "\n```";
    const connector = mockConnector(fencedJson);
    const fileContents = new Map([["src/App.tsx", "const color = '#ff0000';"]]);

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(result.findings).toHaveLength(0);
    expect(result.meta.filteredCount).toBe(1);
  });
});

describe("runFilterStage — oversized file", () => {
  it("keeps all findings and does not call the connector for files over MAX_FILE_CHARS", async () => {
    const f = makeColorFinding("src/Huge.tsx", 1);
    const huge = "x".repeat(60_001);
    const fileContents = new Map([["src/Huge.tsx", huge]]);
    const completeSpy = vi.fn(async () => ({
      text: verdictJson([{ index: 0, keep: false }]),
      usdSpent: 0,
      modelUsed: "fake",
      llmQuality: "higher" as const,
      cacheHit: false,
    }));
    const connector: ConnectorClient = { complete: completeSpy };

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [f], fileContents },
      { connector },
    );

    expect(completeSpy).not.toHaveBeenCalled();
    expect(result.findings).toHaveLength(1);
    expect(result.meta.filteredCount).toBe(0);
    expect(result.meta.filterRan).toBe(false);
  });
});

describe("runFilterStage — connector throws mid-run after a successful file", () => {
  it("keeps the failing file's findings, preserves prior drops, and stays filterRan=true", async () => {
    // File A drops its finding; File B's call throws. B's finding is kept (fail-safe).
    // Files sort alphabetically: "src/A.tsx" < "src/B.tsx".
    const a = makeColorFinding("src/A.tsx", 1);
    const b = makeColorFinding("src/B.tsx", 1);
    const fileContents = new Map([
      ["src/A.tsx", "const c = '#ff0000';"],
      ["src/B.tsx", "const c = '#00ff00';"],
    ]);
    let call = 0;
    const completeSpy = vi.fn(async () => {
      call++;
      if (call === 1) {
        return {
          text: verdictJson([{ index: 0, keep: false }]),
          usdSpent: 0,
          modelUsed: "fake",
          llmQuality: "higher" as const,
          cacheHit: false,
        };
      }
      throw new Error("connector boom");
    });
    const connector: ConnectorClient = { complete: completeSpy };

    const result = await runFilterStage(
      { repoRoot: "/repo", config: MIN_CONFIG, flags: undefined, findings: [a, b], fileContents },
      { connector },
    );

    expect(completeSpy).toHaveBeenCalledTimes(2);
    expect(result.meta.filterRan).toBe(true);
    expect(result.meta.filteredCount).toBe(1);
    // A dropped, B kept
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.location.file).toBe("src/B.tsx");
  });
});
