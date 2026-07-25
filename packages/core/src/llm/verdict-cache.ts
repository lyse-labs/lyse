import { createHash } from "node:crypto";
import type { Finding, LlmVerdict } from "../types.js";
import type { DesignSystemGraph, TokenAxis } from "../graph/types.js";
import { anchorKey } from "../diff/anchor.js";

export interface VerdictEntry { key: string; verdict: LlmVerdict; confidence: number; model: string; }
export interface VerdictCacheFile { schemaVersion: 1; verdicts: VerdictEntry[]; }

const TARGET_AXIS: Record<string, TokenAxis> = {
  "tokens/no-hardcoded-color": "colors",
  "tokens/no-hardcoded-spacing": "spacing",
};

export function axisForTargetRule(ruleId: string): TokenAxis | null {
  return TARGET_AXIS[ruleId] ?? null;
}

const NUL = String.fromCharCode(0);

export function findingContentHash(f: Finding): string {
  const k = anchorKey(f); // { file, rule, bucket } — no line/column
  return createHash("sha256").update([k.rule, k.file, k.bucket].join(NUL)).digest("hex");
}

export function tokenContextHash(graph: DesignSystemGraph, axis: TokenAxis): string {
  const rows = graph.tokens
    .filter((t) => t.axis === axis)
    .map((t) => `${t.id}${NUL}${t.rawValue}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export function verdictKey(f: Finding, graph: DesignSystemGraph): string | null {
  const axis = axisForTargetRule(String(f.ruleId));
  if (axis === null) return null;
  return `${findingContentHash(f)}:${tokenContextHash(graph, axis)}`;
}
