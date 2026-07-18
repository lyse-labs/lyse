import { createHash } from "node:crypto";
import type { AuditResult } from "../../src/types.js";
import { renderJson } from "../../src/reporters/json.js";
import { sortKeysDeep } from "../../src/json-sort-keys.js";

// DECLARED NORMALIZATION ALLOWLIST — every field stripped or collapsed below is volatile
// across runs, environments, or releases and must NOT gate the golden snapshot on a diff
// that carries no audit-behaviour signal. Anything NOT listed here is part of the golden
// contract and a diff is a real change.
//   - timestamp / meta.layer4 / meta.coverage.durationMs  → handled by renderJson(includeTimestamp:false)
//                                                            (wallclock + LLM non-determinism).
//   - toolVersion                                          → blanked below. It's release metadata
//     (Changesets auto-bumps it every publish, e.g. alpha.4 → alpha.5) orthogonal to audit
//     behaviour — leaving it in would false-red the golden test on every Version Packages PR
//     even when nothing about the audit itself changed. rulesVersion/scoringVersion are NOT
//     touched: those are hand-bumped only when audit behaviour actually changes, so they're a
//     real signal worth photographing.
//   - repoRoot + any absolute path to the clone dir        → CI-runner/tmp-specific; replaced with "<REPO>".
//   - findings / suppressedFindings full arrays             → collapsed to <name>Count + <name>Digest.
//     The full per-finding array bloats the repo (shadcn-ui.json was 5.6MB / 136k lines, 30x the next
//     largest snapshot) without adding regression power: the sha256 digest over the renderJson-sorted,
//     path-normalized array detects ANY behavioural change with identical sensitivity to a byte-diff,
//     while `axes[]` (retained in full) already carries the exact per-axis scores, finding counts, and
//     opportunities that the failure-mode assertions in golden.test.ts read from.
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function compactGolden(result: AuditResult, repoPath: string): string {
  const parsed = JSON.parse(renderJson(result, { includeTimestamp: false })) as Record<string, unknown>;
  parsed.toolVersion = ""; // release metadata, orthogonal to audit behaviour — see allowlist note above

  for (const key of ["findings", "suppressedFindings"] as const) {
    if (key in parsed) {
      const arr = parsed[key];
      // Strip the clone-dir path from finding locations before hashing — otherwise the
      // digest (and thus the whole snapshot) would differ across CI runners / local clones
      // even when the audited findings are byte-identical.
      const normalized = JSON.stringify(arr).split(repoPath).join("<REPO>");
      const digest = sha256(normalized);
      delete parsed[key];
      parsed[`${key}Count`] = Array.isArray(arr) ? arr.length : 0;
      parsed[`${key}Digest`] = digest;
    }
  }

  return JSON.stringify(sortKeysDeep(parsed), null, 2).split(repoPath).join("<REPO>") + "\n";
}
