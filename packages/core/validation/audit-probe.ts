import { auditDirectory } from "../src/commands/audit-pipeline.js";
import { withTempRepo } from "./temp-repo.js";
import type { FixtureFiles } from "./types.js";

export async function ruleFlagged(files: FixtureFiles, ruleId: string): Promise<boolean> {
  return withTempRepo(files, async (dir) => {
    const { result } = await auditDirectory(dir, { staticOnly: true });
    return result.findings.some((f) => f.ruleId === ruleId);
  });
}
