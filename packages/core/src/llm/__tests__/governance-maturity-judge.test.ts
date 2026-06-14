import { describe, it, expect } from "vitest";
import { judgeGovernanceMaturity } from "../governance-maturity-judge.js";
import type { ConnectorClient, ConnectorResult } from "../connectors/types.js";

function mockConnector(text: string, extra?: Partial<ConnectorResult>): ConnectorClient {
  return {
    complete: async () => ({
      text,
      usdSpent: 0,
      modelUsed: "fake",
      llmQuality: "higher" as const,
      cacheHit: false,
      ...extra,
    }),
  };
}

const input = { repoName: "cloudscape", aiContext: "awsui-gen-ai-label, role=status live region" };

function ok(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    hasReservedAiTokens: true,
    hasMarkerComponent: true,
    hasInteractionAffordance: false,
    hasGovernanceAffordance: false,
    confidence: 0.78,
    evidence: "awsui-gen-ai-label",
    ...over,
  });
}

describe("judgeGovernanceMaturity", () => {
  it("returns the four signals + confidence + evidence on a valid response", async () => {
    const r = await judgeGovernanceMaturity(input, mockConnector(ok()));
    expect(r).toEqual({
      signals: {
        hasReservedAiTokens: true,
        hasMarkerComponent: true,
        hasInteractionAffordance: false,
        hasGovernanceAffordance: false,
      },
      confidence: 0.78,
      evidence: "awsui-gen-ai-label",
    });
  });

  it("clamps confidence into [0,1]", async () => {
    const r = await judgeGovernanceMaturity(input, mockConnector(ok({ confidence: 1.3 })));
    expect(r?.confidence).toBe(1);
  });

  it("parses a fenced ```json block", async () => {
    const r = await judgeGovernanceMaturity(input, mockConnector("```json\n" + ok() + "\n```"));
    expect(r?.signals.hasMarkerComponent).toBe(true);
  });

  it("returns null when a signal boolean is missing/non-boolean", async () => {
    const r = await judgeGovernanceMaturity(input, mockConnector(ok({ hasMarkerComponent: "yes" })));
    expect(r).toBeNull();
  });

  it("returns null when evidence is empty (anti-hallucination floor)", async () => {
    expect(await judgeGovernanceMaturity(input, mockConnector(ok({ evidence: "" })))).toBeNull();
  });

  it("returns null on an empty connector response (budget/noop)", async () => {
    expect(await judgeGovernanceMaturity(input, mockConnector(""))).toBeNull();
  });

  it("returns null on unparseable output", async () => {
    expect(await judgeGovernanceMaturity(input, mockConnector("not json"))).toBeNull();
  });

  it("returns null when the connector throws", async () => {
    const c: ConnectorClient = { complete: async () => { throw new Error("network"); } };
    expect(await judgeGovernanceMaturity(input, c)).toBeNull();
  });
});
