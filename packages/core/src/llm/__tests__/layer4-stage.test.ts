import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLayer4Stage } from "../layer4-stage.js";
import type { ChatMessage, ConnectorClient, ConnectorResult } from "../connectors/types.js";
import type { RubricDimension } from "../rubric.js";
import type { LyseConfig } from "../../types.js";

function makeRepoRoot(files?: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-layer4-test-"));
  if (files) {
    for (const [rel, content] of Object.entries(files)) {
      const abs = join(dir, rel);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  return dir;
}

function mockConnector(responseText: string, extra?: Partial<ConnectorResult>): ConnectorClient {
  return {
    complete: async () => ({
      text: responseText,
      usdSpent: 0.002,
      modelUsed: "claude-sonnet-4-6",
      llmQuality: "higher" as const,
      cacheHit: false,
      ...extra,
    }),
  };
}

const MIN_CONFIG: LyseConfig = {};

const ONE_DIMENSION: RubricDimension[] = [{
  key: "ai-error-state",
  axis: "ai-governance",
  ruleId: "ai-governance/ai-loading-error-states",
  title: "AI error state",
  question: "Do AI components have error states?",
  scale: "0 = none; 3 = present.",
  evidence: "Cite the error-state element.",
  prompt: "Check that AI components have error states.",
  guidelines: [],
}];

describe("runLayer4Stage — static-only paths", () => {
  it("returns staticOnly:true when flags.staticOnly is set", async () => {
    const repoRoot = makeRepoRoot();
    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: { staticOnly: true }, staticFindings: [] },
    );
    expect(result.meta.staticOnly).toBe(true);
    expect(result.augmentedFindings).toHaveLength(0);
  });

  it("returns staticOnly:true when config.llm.staticOnly is set", async () => {
    const repoRoot = makeRepoRoot();
    const config: LyseConfig = { llm: { staticOnly: true } };
    const result = await runLayer4Stage(
      { repoRoot, config, flags: undefined, staticFindings: [] },
    );
    expect(result.meta.staticOnly).toBe(true);
    expect(result.augmentedFindings).toHaveLength(0);
  });

  it("returns empty meta when rubric dimensions is empty (no staticOnly flag)", async () => {
    const repoRoot = makeRepoRoot();
    const connector = mockConnector("{}");
    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector, rubricDimensions: [] },
    );
    expect(result.meta.staticOnly).toBeUndefined();
    expect(result.augmentedFindings).toHaveLength(0);
  });

  it("skips augmentation (no connector call) when LYSE_SKIP_LAYER4_AUGMENTATION=1", async () => {
    const repoRoot = makeRepoRoot({ "src/Chat.tsx": "export function Chat() { return null; }" });
    const completeSpy = vi.fn(async () => ({
      text: JSON.stringify({ findings: [] }),
      usdSpent: 0,
      modelUsed: "fake",
      llmQuality: "higher" as const,
      cacheHit: false,
    }));
    const connector = { complete: completeSpy };
    vi.stubEnv("LYSE_SKIP_LAYER4_AUGMENTATION", "1");
    try {
      const result = await runLayer4Stage(
        { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
        { connector, rubricDimensions: ONE_DIMENSION },
      );
      expect(completeSpy).not.toHaveBeenCalled();
      expect(result.augmentedFindings).toHaveLength(0);
      expect(result.meta.staticOnly).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("runLayer4Stage — happy path", () => {
  it("produces augmented findings when connector returns valid JSON", async () => {
    const repoRoot = makeRepoRoot({ "src/Chat.tsx": "export function Chat() { return null; }" });
    const responseJson = JSON.stringify({
      findings: [{
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/Chat.tsx",
        line: 1,
        column: 1,
        snippet: "export function Chat()",
        message: "Missing AI error state",
      }],
    });
    const connector = mockConnector(responseJson);

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector, rubricDimensions: ONE_DIMENSION },
    );

    expect(result.augmentedFindings).toHaveLength(1);
    expect(result.augmentedFindings[0]!.ruleId).toBe("ai-governance/ai-loading-error-states");
    expect(result.meta.staticOnly).toBeUndefined();
    expect(result.meta.modelUsed).toBe("claude-sonnet-4-6");
    expect(result.meta.usdSpent).toBe(0.002);
    expect(result.meta.droppedHallucinations).toBe(0);
    expect(result.meta.llmQuality).toBe("higher");
  });

  it("attaches llmJudgement when the grader returns a confidence (Phase D, D-gov-1)", async () => {
    const repoRoot = makeRepoRoot({ "src/Chat.tsx": "export function Chat() { return null; }" });
    const responseJson = JSON.stringify({
      findings: [{
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/Chat.tsx",
        line: 1,
        column: 1,
        snippet: "export function Chat()",
        message: "Missing AI error state",
        confidence: 0.77,
      }],
    });
    const connector = mockConnector(responseJson);

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector, rubricDimensions: ONE_DIMENSION },
    );

    expect(result.augmentedFindings).toHaveLength(1);
    expect(result.augmentedFindings[0]!.llmJudgement).toEqual({ verdict: "violation", confidence: 0.77 });
  });

  it("sets cacheHit in meta when connector returns cacheHit:true", async () => {
    const repoRoot = makeRepoRoot({ "Foo.tsx": "const x = 1;" });
    const responseJson = JSON.stringify({ findings: [] });
    const connector = mockConnector(responseJson, { cacheHit: true, usdSpent: 0 });

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector, rubricDimensions: ONE_DIMENSION },
    );
    expect(result.meta.cacheHit).toBe(true);
    expect(result.meta.usdSpent).toBe(0);
  });

  it("populates droppedHallucinations for findings with missing files", async () => {
    const repoRoot = makeRepoRoot();
    const responseJson = JSON.stringify({
      findings: [{
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "warning",
        file: "src/GhostFile.tsx",
        line: 1,
        column: 1,
        snippet: "export function Ghost()",
        message: "Hallucination",
      }],
    });
    const connector = mockConnector(responseJson);

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector, rubricDimensions: ONE_DIMENSION },
    );

    expect(result.augmentedFindings).toHaveLength(0);
    expect(result.meta.droppedHallucinations).toBe(1);
  });

  it("handles JSON wrapped in markdown code fence", async () => {
    const repoRoot = makeRepoRoot({ "Btn.tsx": "export const Btn = () => null;" });
    const responseJson = "```json\n" + JSON.stringify({
      findings: [{
        ruleId: "ai-governance/ai-loading-error-states",
        axis: "ai-governance",
        severity: "info",
        file: "Btn.tsx",
        line: 1,
        column: 1,
        snippet: "export const Btn = () => null;",
        message: "Btn found",
      }],
    }) + "\n```";
    const connector = mockConnector(responseJson);

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector, rubricDimensions: ONE_DIMENSION },
    );
    expect(result.augmentedFindings).toHaveLength(1);
  });
});

describe("runLayer4Stage — error handling", () => {
  it("returns meta.error and empty findings when connector throws", async () => {
    const repoRoot = makeRepoRoot();
    const errorConnector: ConnectorClient = {
      complete: async () => { throw new Error("network failure"); },
    };

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector: errorConnector, rubricDimensions: ONE_DIMENSION },
    );

    expect(result.augmentedFindings).toHaveLength(0);
    expect(result.meta.error).toBeDefined();
    expect(result.meta.error!.kind).toBe("ConnectorError");
    expect(result.meta.error!.message).toContain("network failure");
  });

  it("returns meta.error and empty findings when JSON is malformed", async () => {
    const repoRoot = makeRepoRoot();
    const connector = mockConnector("not json at all {{{");

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector, rubricDimensions: ONE_DIMENSION },
    );

    expect(result.augmentedFindings).toHaveLength(0);
    expect(result.meta.error).toBeDefined();
    expect(result.meta.error!.kind).toBe("ParseError");
  });

  it("returns empty meta when connector returns empty text (noop/over-budget)", async () => {
    const repoRoot = makeRepoRoot();
    const noopConnector = mockConnector("", { usdSpent: 0, modelUsed: "none", llmQuality: "lower" as const });

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector: noopConnector, rubricDimensions: ONE_DIMENSION },
    );

    expect(result.augmentedFindings).toHaveLength(0);
    expect(result.meta.staticOnly).toBeUndefined();
  });
});

describe("runLayer4Stage — real rubric default", () => {
  it("uses the real governance dimensions when none are passed and surfaces a validated finding", async () => {
    const repoRoot = makeRepoRoot({
      "src/Chat.tsx":
        "export function Chat() { return <div>I feel happy to help you today friend</div>; }",
    });
    const responseJson = JSON.stringify({
      findings: [
        {
          ruleId: "ai-governance/ai-marker-anti-patterns",
          axis: "ai-governance",
          severity: "warning",
          file: "src/Chat.tsx",
          line: 1,
          column: 1,
          snippet: "I feel happy to help you today friend",
          message: "Anthropomorphic copy: first-person emotion",
        },
      ],
    });
    const connector = mockConnector(responseJson);

    const result = await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector },
    );

    expect(result.augmentedFindings).toHaveLength(1);
    expect(result.augmentedFindings[0]!.ruleId).toBe("ai-governance/ai-marker-anti-patterns");
    expect(result.meta.droppedHallucinations).toBe(0);
  });

  it("includes every rubric dimension key in the assembled prompt", async () => {
    const repoRoot = makeRepoRoot({ "Foo.tsx": "const x = 1;" });
    let captured = "";
    const spyConnector: ConnectorClient = {
      complete: async (messages: ChatMessage[]) => {
        captured = messages.map((m) => m.content).join("\n");
        return {
          text: JSON.stringify({ findings: [] }),
          usdSpent: 0,
          modelUsed: "claude-sonnet-4-6",
          llmQuality: "higher" as const,
          cacheHit: false,
        };
      },
    };

    await runLayer4Stage(
      { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
      { connector: spyConnector },
    );

    for (const key of [
      "human-control-enforced",
      "voice-anti-anthropomorphism",
      "explanation-quality",
      "risk-classification",
      "value-gate-judgment",
    ]) {
      expect(captured).toContain(key);
    }
  });
});

describe("runLayer4Stage — timeout timer cleanup (regression)", () => {
  it("clears the timeout timer when the connector resolves instantly (no leaked handle)", async () => {
    vi.useFakeTimers();
    try {
      const repoRoot = makeRepoRoot({ "Foo.tsx": "const x = 1;" });
      const connector = mockConnector(JSON.stringify({ findings: [] }));

      await runLayer4Stage(
        { repoRoot, config: MIN_CONFIG, flags: undefined, staticFindings: [] },
        { connector },
      );

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
