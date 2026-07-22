import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { withTempRepo } from "./temp-repo.js";
import type { FixtureFiles } from "./types.js";

/**
 * KNOWN BLIND SPOT — read this before trusting a J=1 from the engine gate on a
 * token-axis rule.
 *
 * `info` findings do not count as a flag here, and since the four-class
 * resolver migration the `novel` class on the seven NUMERIC token axes
 * (spacing, radii, border-width, opacity, z-index, breakpoints, and motion
 * durations) emits exactly `info`. A construction fixture whose mutation lands
 * `novel` is therefore indistinguishable from a rule that said nothing at all:
 * the oracle records a false negative even though the rule reported correctly.
 *
 * Two consequences, both real:
 *   1. Every one of those adapters has to give its fixture a REAL token scale so
 *      the mutation lands `near` (warning) instead of `novel` — see the comments
 *      in `hardcoded-value-adapters.ts`. That is why they carry token sources at
 *      all.
 *   2. The far-from-scale detection path on those axes is consequently NOT
 *      proven by the gate. A J=1 on such a rule means "near-scale drift is
 *      detected with no false positives" — it does NOT mean the `novel` branch
 *      works. That branch is covered by unit tests in `tests/rules/` instead.
 *
 * Closing it properly means teaching `evaluateAdapter` an expected severity (or
 * giving this probe an opt-in for `info`) rather than widening the predicate
 * here — widening it unconditionally would make every advisory `info` finding
 * count as a violation across all 66 rules. Documented in
 * `docs/architecture/reliability.md` and `docs/architecture/gate-b-spec.md`.
 */
export async function ruleFlagged(files: FixtureFiles, ruleId: string): Promise<boolean> {
  return withTempRepo(files, async (dir) => {
    const { result } = await auditDirectory(dir, { staticOnly: true });
    // info findings are informational, not violations — only error/warning count as a flag.
    return result.findings.some((f) => f.ruleId === ruleId && (f.severity === "error" || f.severity === "warning"));
  });
}
