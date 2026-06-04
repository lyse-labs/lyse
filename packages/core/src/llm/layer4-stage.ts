import type { Finding, Layer4Meta, LyseConfig } from "../types.js";
import type { AuditFlags } from "../commands/audit-flags.js";

export interface Layer4StageInput {
  repoRoot: string;
  config: LyseConfig;
  flags: AuditFlags | undefined;
  staticFindings: Finding[];
}

export interface Layer4StageResult {
  augmentedFindings: Finding[];
  meta: Layer4Meta;
}

/**
 * v0.1 stub — LLM Layer 4 was descoped in the Phase 1 reset (#106); the default
 * audit path is static-only. The prior implementation is in git history if a
 * future release revisits LLM augmentation.
 */
export async function runLayer4Stage(_input: Layer4StageInput): Promise<Layer4StageResult> {
  return {
    augmentedFindings: [],
    meta: { staticOnly: true },
  };
}
