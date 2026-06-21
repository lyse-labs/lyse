import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { auditDirectory } from "./audit-pipeline.js";
import { detectFromGit } from "../detection/from-git.js";
import { buildBadge, type BadgeGrade } from "../share/badge.js";
import { createSpinner } from "../util/spinner.js";

export interface BadgeOptions {
  write?: boolean;
  quiet?: boolean;
}

function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, path);
}

export async function runBadge(cwd: string, opts: BadgeOptions = {}): Promise<void> {
  const isTTY = process.stderr.isTTY ?? false;
  const isQuiet = opts.quiet === true || process.env["LYSE_QUIET"] === "1";
  const spinner = createSpinner({ isTTY, enabled: isTTY && !isQuiet });

  spinner.start("Auditing…");
  let audit;
  try {
    audit = await auditDirectory(cwd, { progress: spinner });
  } catch (err) {
    const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
    spinner.fail(`Badge failed: ${msg}`);
    throw err;
  }
  spinner.succeed(`Health Score ${audit.result.finalScore}/100`);

  const git = await detectFromGit(cwd);
  const gh = git.github.value;
  const repoUrl = gh ? `https://github.com/${gh.owner}/${gh.repo}` : null;
  const branch = git.git.value?.defaultBranch ?? "main";

  const grade = (audit.result.grade?.grade ?? "N/A") as BadgeGrade;
  const badge = buildBadge({ score: audit.result.finalScore, grade, repoUrl });

  // stdout carries only the pasteable markdown.
  process.stdout.write(badge.staticMarkdown + "\n");

  if (opts.write === true) {
    const jsonPath = join(cwd, ".lyse", "badge.json");
    writeJsonAtomic(jsonPath, badge.endpointJson);
    if (gh) {
      const rawUrl = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${branch}/.lyse/badge.json`;
      process.stdout.write("\n# Auto-updating badge (commit .lyse/badge.json; refresh in CI with `lyse badge --write`):\n");
      process.stdout.write(badge.endpointMarkdown(rawUrl) + "\n");
    } else {
      process.stdout.write(
        "\n# Wrote .lyse/badge.json. No GitHub remote detected — reference it with:\n" +
          "# https://img.shields.io/endpoint?url=<raw-url-to-your-committed-.lyse/badge.json>\n",
      );
    }
  }
}
