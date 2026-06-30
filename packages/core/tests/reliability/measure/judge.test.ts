import { describe, it, expect } from "vitest";
import { judgeFindings, packetFor, buildJudgePrompt } from "../../../src/reliability/measure/judge.js";
import type { ConnectorClient, ConnectorResult } from "../../../src/llm/connectors/types.js";
import type { FindingRow } from "../../../../scripts/harvest-findings.js";

function makeRow(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    ruleId: "tokens/no-hardcoded-color",
    repo: "test-repo",
    file: "src/Button.tsx",
    line: 10,
    snippet: 'color: "#ff0000"',
    fileType: ".tsx",
    confidence: "high",
    ...overrides,
  };
}

function makeFakeConnector(
  verdicts: Array<{ index: number; verdict: string; confidence: number }>,
): ConnectorClient {
  return {
    complete: async (): Promise<ConnectorResult> => ({
      text: JSON.stringify({ verdicts }),
      usdSpent: 0,
      modelUsed: "fake",
      llmQuality: "higher",
      cacheHit: false,
    }),
  };
}

describe("judgeFindings", () => {
  it("labels confident verdicts tp/fp and uncertain below threshold (all llm-provisional)", async () => {
    const rows = [
      makeRow({ file: "src/Button.tsx", line: 10, snippet: 'color: "#ff0000"' }),
      makeRow({ file: "src/Button.tsx", line: 20, snippet: 'padding: "8px"' }),
      makeRow({ file: "src/Button.tsx", line: 30, snippet: "background: blue" }),
    ];

    const connector = makeFakeConnector([
      { index: 0, verdict: "violation", confidence: 0.95 },
      { index: 1, verdict: "fp", confidence: 0.9 },
      { index: 2, verdict: "uncertain", confidence: 0.4 },
    ]);

    const out = await judgeFindings(rows, { connector, confThreshold: 0.7 });

    const label0 = out.get(rows[0]!);
    const label1 = out.get(rows[1]!);
    const label2 = out.get(rows[2]!);

    expect(label0).toBeDefined();
    expect(label0!.verdict).toBe("tp");
    expect(label0!.source).toBe("llm-provisional");
    expect(label0!.confidence).toBe(0.95);

    expect(label1).toBeDefined();
    expect(label1!.verdict).toBe("fp");
    expect(label1!.source).toBe("llm-provisional");
    expect(label1!.confidence).toBe(0.9);

    expect(label2).toBeDefined();
    expect(label2!.verdict).toBe("uncertain");
    expect(label2!.source).toBe("llm-provisional");

    expect(out.size).toBe(3);
  });

  it("maps violation below threshold to uncertain", async () => {
    const rows = [makeRow()];
    const connector = makeFakeConnector([
      { index: 0, verdict: "violation", confidence: 0.5 },
    ]);

    const out = await judgeFindings(rows, { connector, confThreshold: 0.7 });
    const label = out.get(rows[0]!);
    expect(label!.verdict).toBe("uncertain");
    expect(label!.source).toBe("llm-provisional");
  });

  it("maps fp below threshold to uncertain", async () => {
    const rows = [makeRow()];
    const connector = makeFakeConnector([
      { index: 0, verdict: "fp", confidence: 0.3 },
    ]);

    const out = await judgeFindings(rows, { connector, confThreshold: 0.7 });
    const label = out.get(rows[0]!);
    expect(label!.verdict).toBe("uncertain");
    expect(label!.source).toBe("llm-provisional");
  });

  it("handles connector error gracefully (uncertain fallback)", async () => {
    const rows = [makeRow()];
    const connector: ConnectorClient = {
      complete: async () => { throw new Error("network fail"); },
    };

    const out = await judgeFindings(rows, { connector });
    const label = out.get(rows[0]!);
    expect(label!.verdict).toBe("uncertain");
    expect(label!.source).toBe("llm-provisional");
  });

  it("handles empty connector response (uncertain fallback)", async () => {
    const rows = [makeRow()];
    const connector: ConnectorClient = {
      complete: async (): Promise<ConnectorResult> => ({
        text: "",
        usdSpent: 0,
        modelUsed: "noop",
        llmQuality: "lower",
        cacheHit: false,
      }),
    };

    const out = await judgeFindings(rows, { connector });
    const label = out.get(rows[0]!);
    expect(label!.verdict).toBe("uncertain");
    expect(label!.source).toBe("llm-provisional");
  });

  it("batches across files into ceil(N/BATCH) connector calls, not one per file", async () => {
    let calls = 0;
    const fake = {
      complete: async (msgs: { role: string; content: string }[]) => {
        calls++;
        const idxs = [...msgs[0]!.content.matchAll(/^(\d+) —/gm)].map((m) => Number(m[1]));
        return { text: JSON.stringify({ verdicts: idxs.map((i) => ({ index: i, verdict: "violation", confidence: 0.95 })) }) };
      },
    } as any;
    const rows = Array.from({ length: 25 }, (_, i) => ({ ruleId: "tokens/no-hardcoded-color", repo: "r", file: `f${i}.tsx`, line: 1, snippet: `x${i}`, fileType: ".tsx", confidence: "high" as const }));
    const out = await judgeFindings(rows, { connector: fake, confThreshold: 0.7 });
    expect(calls).toBe(2);
    expect(out.size).toBe(25);
    for (const [, label] of out) expect(label.verdict).toBe("tp");
  });
});

describe("packetFor", () => {
  it("renders uncertain rows as markdown containing ruleId and [ ] TP checklist", () => {
    const row = makeRow({ snippet: 'color: "#ff0000"' });
    const label = { verdict: "uncertain" as const, source: "llm-provisional" as const, confidence: 0.4 };

    const md = packetFor("tokens/no-hardcoded-color", [{ row, label }]);

    expect(md).toContain("tokens/no-hardcoded-color");
    expect(md).toContain("[ ] TP");
    expect(md).toContain("[ ] FP");
    expect(md).toContain('color: "#ff0000"');
  });

  it("renders confidence in the packet", () => {
    const row = makeRow({ snippet: "padding: 8px", line: 42 });
    const label = { verdict: "uncertain" as const, source: "llm-provisional" as const, confidence: 0.35 };

    const md = packetFor("tokens/no-hardcoded-spacing", [{ row, label }]);

    expect(md).toContain("0.35");
    expect(md).toContain("42");
  });

  it("includes multiple rows", () => {
    const row1 = makeRow({ line: 10 });
    const row2 = makeRow({ line: 20, snippet: "margin: 4px" });

    const items = [
      { row: row1, label: { verdict: "uncertain" as const, source: "llm-provisional" as const, confidence: 0.4 } },
      { row: row2, label: { verdict: "uncertain" as const, source: "llm-provisional" as const, confidence: 0.6 } },
    ];

    const md = packetFor("tokens/no-hardcoded-color", items);
    expect(md).toContain("line 10");
    expect(md).toContain("line 20");
  });

  it("returns empty string when no rows provided", () => {
    const md = packetFor("tokens/no-hardcoded-color", []);
    expect(md).toBe("");
  });
});

describe("buildJudgePrompt", () => {
  it("includes rule shortDescription and examples for a11y/interactive-role-name", () => {
    const row = makeRow({ ruleId: "a11y/interactive-role-name", snippet: "<button><svg /></button>" });
    const prompt = buildJudgePrompt([row]);
    expect(prompt).toContain("a11y/interactive-role-name");
    expect(prompt).toContain("Accessible name on interactive controls");
    expect(prompt).toContain("aria-label");
  });

  it("does not include color-picker rubric for a11y/interactive-role-name", () => {
    const row = makeRow({ ruleId: "a11y/interactive-role-name", snippet: "<button><svg /></button>" });
    const prompt = buildJudgePrompt([row]);
    expect(prompt).not.toContain("color-picker");
    expect(prompt).not.toContain("palette");
  });

  it("includes rule shortDescription and examples for components/no-arbitrary-tailwind", () => {
    const row = makeRow({ ruleId: "components/no-arbitrary-tailwind", snippet: '<div className="p-[12px]">' });
    const prompt = buildJudgePrompt([row]);
    expect(prompt).toContain("components/no-arbitrary-tailwind");
    expect(prompt).toContain("Disallow non-color arbitrary Tailwind values");
    expect(prompt).toContain("p-[12px]");
  });

  it("does not include color-picker rubric for components/no-arbitrary-tailwind", () => {
    const row = makeRow({ ruleId: "components/no-arbitrary-tailwind", snippet: '<div className="p-[12px]">' });
    const prompt = buildJudgePrompt([row]);
    expect(prompt).not.toContain("color-picker");
    expect(prompt).not.toContain("palette");
  });

  it("keeps general heuristics (storybook fp, token fp)", () => {
    const row = makeRow({ ruleId: "a11y/interactive-role-name", snippet: "<button><svg /></button>" });
    const prompt = buildJudgePrompt([row]);
    expect(prompt).toContain("Storybook");
    expect(prompt).toContain("var()");
  });

  it("falls back to generic rubric for unknown ruleId without crashing", () => {
    const row = makeRow({ ruleId: "unknown/nonexistent-rule" as any, snippet: "x" });
    const prompt = buildJudgePrompt([row]);
    expect(prompt).toContain("unknown/nonexistent-rule");
    expect(prompt).not.toContain("color-picker");
  });
});
