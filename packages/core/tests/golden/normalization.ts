import type { AuditResult } from "../../src/types.js";
import { renderJson } from "../../src/reporters/json.js";

// DECLARED NORMALIZATION ALLOWLIST (LYSE-MISSION §4.1 — reviewed artifact, not ad-hoc stripping).
// Each removal below is volatile across runs/environments and must NOT gate the golden snapshot:
//   - timestamp / meta.layer4 / meta.coverage.durationMs  → handled by renderJson(includeTimestamp:false)
//                                                            (wallclock + LLM non-determinism).
//   - repoRoot + any absolute path to the clone dir        → CI-runner/tmp-specific; replaced with "<REPO>".
// Anything NOT listed here is part of the golden contract and a diff is a real change.
export function normalizeGolden(result: AuditResult, repoPath: string): string {
  const json = renderJson(result, { includeTimestamp: false });
  // Replace the absolute clone path everywhere it appears (repoRoot, coverage.configPath, finding locations).
  return json.split(repoPath).join("<REPO>");
}
