import { copyToClipboard, formatShareMarkdown } from "../share/clipboard.js";
import { detectFromGit } from "../detection/from-git.js";
import { auditDirectory } from "./audit-pipeline.js";
import { ruleMap } from "../rules/registry.js";
import { createSpinner } from "../util/spinner.js";

export interface ShareOptions {
  quiet?: boolean;
}

export async function runShare(cwd: string, opts: ShareOptions = {}): Promise<void> {
  const isTTY = process.stderr.isTTY ?? false;
  const isQuiet = opts.quiet === true || process.env["LYSE_QUIET"] === "1";
  const spinner = createSpinner({ isTTY, enabled: isTTY && !isQuiet });

  spinner.start("Discovering files…");
  let audit;
  try {
    audit = await auditDirectory(cwd, { progress: spinner });
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    spinner.fail(`Share failed: ${msg}`);
    throw err;
  }

  spinner.update("Copying summary to clipboard…");

  const git = await detectFromGit(cwd);
  const repo = git.github.value ? `${git.github.value.owner}/${git.github.value.repo}` : null;

  const counts = new Map<string, { count: number; fixable: boolean }>();
  for (const f of audit.result.findings) {
    const rule = ruleMap.get(f.ruleId);
    const isFixable = !!rule?.applyCodemod;
    const existing = counts.get(f.ruleId) ?? { count: 0, fixable: isFixable };
    existing.count++;
    counts.set(f.ruleId, existing);
  }
  const topRules = Array.from(counts.entries())
    .map(([ruleId, v]) => ({ ruleId, ...v }))
    .sort((a, b) => b.count - a.count);

  const axes: { tokens: number | null; a11y: number | null; components: number | null; stories: number | null } = {
    tokens: null,
    a11y: null,
    components: null,
    stories: null,
  };
  for (const axisScore of audit.result.axes) {
    if (axisScore.axis === "tokens" && typeof axisScore.score === "number") axes.tokens = axisScore.score;
    else if (axisScore.axis === "a11y" && typeof axisScore.score === "number") axes.a11y = axisScore.score;
    else if (axisScore.axis === "components" && typeof axisScore.score === "number") axes.components = axisScore.score;
    else if (axisScore.axis === "stories" && typeof axisScore.score === "number") axes.stories = axisScore.score;
  }

  const md = formatShareMarkdown(audit.result.finalScore, axes, topRules, repo);

  try {
    await copyToClipboard(md);
    spinner.succeed(`Summary copied · score ${audit.result.finalScore}/100 · paste into Slack / Notion / email`);
  } catch {
    spinner.fail("Clipboard unavailable — printing summary below");
    console.log(md);
  }
}
