import { join } from "node:path";
import { auditDirectory } from "./audit-pipeline.js";
import { buildBaseline, writeBaseline } from "../diff/baseline.js";
import { ensureLyseGitignore } from "../util/lyse-gitignore.js";

export async function runBaselineWrite(opts: {
  root: string;
  quiet?: boolean;
}): Promise<{ path: string; findingCount: number }> {
  const { result, graph } = await auditDirectory(opts.root);
  const baseline = buildBaseline(result, graph);
  const path = join(opts.root, ".lyse", "baseline.json");
  writeBaseline(path, baseline);
  await ensureLyseGitignore(opts.root);
  if (opts.quiet !== true) {
    process.stdout.write(
      `Wrote ${path} — ${result.findings.length} findings baselined.\n` +
        `Next: commit .lyse/baseline.json, then CI (or \`lyse audit --scope new\`) gates only new findings.\n`,
    );
  }
  return { path, findingCount: result.findings.length };
}
