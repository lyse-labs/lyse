import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { withTempRepo } from "./temp-repo.js";
import type { FixtureFiles } from "./types.js";

export async function ruleFlagged(files: FixtureFiles, ruleId: string): Promise<boolean> {
  return withTempRepo(files, async (dir) => {
    const { result } = await auditDirectory(dir, { staticOnly: true });
    // info findings are informational, not violations — only error/warning count as a flag.
    return result.findings.some((f) => f.ruleId === ruleId && (f.severity === "error" || f.severity === "warning"));
  });
}

/**
 * Like `ruleFlagged`, but does not filter by severity. Needed for the pure
 * composite axes (shadows, typography — see tokens-no-hardcoded-shadow.ts's
 * `shadowVerdict`): the four-class resolver's `near` is structurally
 * unreachable there, so a real, unscaled violation resolves `novel` and is
 * honestly reported at `info` — never `warning` — no matter how the fixture's
 * token scale is shaped. `ruleFlagged` would read that as silence; this
 * proves the rule still surfaces the drift instead of actually going quiet.
 */
export async function ruleReported(files: FixtureFiles, ruleId: string): Promise<boolean> {
  return withTempRepo(files, async (dir) => {
    const { result } = await auditDirectory(dir, { staticOnly: true });
    return result.findings.some((f) => f.ruleId === ruleId);
  });
}
