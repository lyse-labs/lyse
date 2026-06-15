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

describe("judgeGovernanceMaturity (grounded per-signal evidence)", () => {
  it("keeps a true signal that has concrete per-signal evidence", async () => {
    const c = mockConnector(
      JSON.stringify({
        hasReservedAiTokens: true,
        hasMarkerComponent: true,
        hasInteractionAffordance: false,
        hasGovernanceAffordance: false,
        confidence: 0.8,
        evidence: { hasReservedAiTokens: "color-text-label-gen-ai", hasMarkerComponent: "awsui-gen-ai-label" },
      }),
    );
    const r = await judgeGovernanceMaturity(input, c);
    expect(r?.signals).toEqual({
      hasReservedAiTokens: true,
      hasMarkerComponent: true,
      hasInteractionAffordance: false,
      hasGovernanceAffordance: false,
    });
  });

  it("DOWNGRADES a true signal that lacks per-signal evidence (kills over-detection)", async () => {
    const c = mockConnector(
      JSON.stringify({
        hasReservedAiTokens: true,
        hasMarkerComponent: true,
        hasInteractionAffordance: true,
        hasGovernanceAffordance: true, // claimed but no evidence → must drop
        confidence: 0.9,
        evidence: {
          hasReservedAiTokens: "color-text-label-gen-ai",
          hasMarkerComponent: "awsui-gen-ai-label",
          hasInteractionAffordance: "aria-live on AiAnswer",
          // hasGovernanceAffordance has NO evidence
        },
      }),
    );
    const r = await judgeGovernanceMaturity(input, c);
    expect(r?.signals.hasGovernanceAffordance).toBe(false);
    expect(r?.signals.hasInteractionAffordance).toBe(true);
    expect(r?.evidence["hasGovernanceAffordance"]).toBeUndefined();
  });

  it("treats empty-string evidence as no evidence (downgrades)", async () => {
    const c = mockConnector(
      JSON.stringify({
        hasReservedAiTokens: true,
        hasMarkerComponent: false,
        hasInteractionAffordance: false,
        hasGovernanceAffordance: false,
        confidence: 0.7,
        evidence: { hasReservedAiTokens: "   " },
      }),
    );
    const r = await judgeGovernanceMaturity(input, c);
    expect(r?.signals.hasReservedAiTokens).toBe(false);
  });

  it("returns an all-false judgement when nothing is grounded (valid, not null)", async () => {
    const c = mockConnector(
      JSON.stringify({
        hasReservedAiTokens: false,
        hasMarkerComponent: false,
        hasInteractionAffordance: false,
        hasGovernanceAffordance: false,
        confidence: 0.6,
        evidence: {},
      }),
    );
    const r = await judgeGovernanceMaturity(input, c);
    expect(r).not.toBeNull();
    expect(Object.values(r!.signals).every((v) => v === false)).toBe(true);
  });

  it("clamps confidence into [0,1]", async () => {
    const c = mockConnector(
      JSON.stringify({
        hasReservedAiTokens: false,
        hasMarkerComponent: false,
        hasInteractionAffordance: false,
        hasGovernanceAffordance: false,
        confidence: 1.4,
        evidence: {},
      }),
    );
    expect((await judgeGovernanceMaturity(input, c))?.confidence).toBe(1);
  });

  it("returns null when a signal boolean is missing/non-boolean", async () => {
    const c = mockConnector(JSON.stringify({ hasMarkerComponent: "yes", confidence: 0.5, evidence: {} }));
    expect(await judgeGovernanceMaturity(input, c)).toBeNull();
  });

  it("returns null on empty / unparseable / throwing connector", async () => {
    expect(await judgeGovernanceMaturity(input, mockConnector(""))).toBeNull();
    expect(await judgeGovernanceMaturity(input, mockConnector("not json"))).toBeNull();
    const t: ConnectorClient = { complete: async () => { throw new Error("net"); } };
    expect(await judgeGovernanceMaturity(input, t)).toBeNull();
  });
});
