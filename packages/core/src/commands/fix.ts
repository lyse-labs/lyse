/**
 * commands/fix.ts — Auto-fix orchestrator with 6 safety guards.
 *
 * Guard 1: always creates a separate branch (lyse/auto-fix-DATE, collision-safe)
 * Guard 2: refuses to run on a dirty working tree (--force-on-dirty override)
 * Guard 3: first-run dry-run preview hook (interactive prompt plugged in by Task 18)
 * Guard 4: confidence floor — default "high"; opt-in via --confidence=medium|low
 * Guard 5: per-rule commits with descriptive messages
 * Guard 6: optional test verification (--verify-with-tests; reverts commit on fail)
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import {
  ensureClean,
  ensureSafeBranch,
  createBranch,
  commitAll,
  revertCommit,
  runTests,
  hasTestScript,
} from "../codemods/git-helpers.js";
import { groupByConfidence, groupByRule, buildClassifyContext } from "../codemods/safety.js";
import { auditDirectory } from "./audit-pipeline.js";
import { appendFixEvent as appendFixEventStore } from "../history/ndjson-store.js";
import type { Finding, Confidence, CodemodContext } from "../types.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface FixOptions {
  /** Absolute path to the repository root. */
  cwd: string;
  /** Dry-run mode: compute what would be done but don't write or commit. */
  dryRun?: boolean | undefined;
  /** Enable interactive prompts (used by Task 18 wizard). */
  interactive?: boolean | undefined;
  /** Minimum confidence floor; defaults to "high". */
  confidence?: Confidence | undefined;
  /** Limit fixes to a specific rule ID. */
  rule?: string | undefined;
  /** Override Guard 2 and allow running on a dirty working tree. */
  forceOnDirty?: boolean | undefined;
  /** Run the test suite after each rule batch and revert on failure (Guard 6). */
  verifyWithTests?: boolean | undefined;
  /** Override the branch name (useful for tests). */
  branch?: string | undefined;
  /** Skip interactive prompts (used in tests and CI). */
  autoApprove?: boolean | undefined;
}

export interface RuleResult {
  ruleId: string;
  count: number;
  commitSha: string | null;
  testsPassed?: boolean | undefined;
  /** Warnings for findings that could not be applied (e.g. git apply reject, empty diff). */
  warnings?: string[];
}

export interface FixResult {
  branch: string;
  ruleResults: RuleResult[];
  skipped: { medium: number; low: number };
}

// ---------------------------------------------------------------------------
// Rule lookup — map from rule ID to Rule (which carries applyCodemod)
// ---------------------------------------------------------------------------

import { ruleMap } from "../rules/registry.js";


// ---------------------------------------------------------------------------
// Diff application
// ---------------------------------------------------------------------------

/**
 * Apply a unified diff to the working tree using `git apply`.
 * The diff must be a valid unified diff with paths relative to `cwd`.
 *
 * If `diff` is empty, this is a no-op.
 */
async function applyDiff(cwd: string, diff: string): Promise<void> {
  if (!diff) return;
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["apply", "--recount", "-"], { cwd });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git apply failed (exit ${code}): ${stderr.trim()}`));
      }
    });
    child.on("error", reject);
    child.stdin.write(diff);
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runFix(opt: FixOptions): Promise<FixResult> {
  // Guard 2: refuse on dirty working tree (unless --force-on-dirty)
  await ensureClean(opt.cwd, opt.forceOnDirty ?? false);

  // Pre-flight: must not be on a detached HEAD
  await ensureSafeBranch(opt.cwd);

  // Run audit to discover findings
  const { result: auditResult, tokens, config } = await auditDirectory(opt.cwd);

  // Build ClassifyContext from audit results (shared with the post-audit menu count)
  const ctx = buildClassifyContext(auditResult.findings, tokens, config, opt.cwd);

  // Filter to fixable findings (those where the rule has applyCodemod)
  const fixable = auditResult.findings.filter((f: Finding) => {
    const rule = ruleMap.get(f.ruleId);
    return !!rule?.applyCodemod;
  });

  // Group by confidence level (Guard 4: confidence floor)
  const grouped = groupByConfidence(fixable, ctx);

  // Guard 4: confidence floor — default "high"
  const floor: Confidence = opt.confidence ?? "high";
  let toApply: Finding[];
  if (floor === "high") {
    toApply = grouped.high;
  } else if (floor === "medium") {
    toApply = [...grouped.high, ...grouped.medium];
  } else {
    toApply = [...grouped.high, ...grouped.medium, ...grouped.low];
  }

  // Apply rule filter if requested
  if (opt.rule) {
    toApply = toApply.filter((f) => f.ruleId === opt.rule);
  }

  // Guard 3: first-run dry-run preview
  // If this is the first run AND interactive mode is on AND not autoApprove,
  // Task 18 wizard will inject a prompt here. For now, the hook is present
  // but non-blocking (the logic slot is reserved, not filled until Task 18).
  // Task 18: const firstRun = await isFirstAutoFixStore(opt.cwd);
  // Task 18: if (firstRun && opt.interactive && !opt.autoApprove) { await showPreviewPrompt(...); }

  // Guard 1: create a separate branch
  const branchName = opt.branch ?? `lyse/auto-fix-${new Date().toISOString().slice(0, 10)}`;
  // In dry-run mode we never actually create the branch
  const actualBranch = opt.dryRun ? branchName : await createBranch(opt.cwd, branchName);

  const ruleResults: RuleResult[] = [];
  const byRule = groupByRule(toApply);

  for (const [ruleId, findings] of byRule.entries()) {
    // Dry-run: just report what would happen, no mutations
    if (opt.dryRun) {
      ruleResults.push({ ruleId, count: findings.length, commitSha: null });
      continue;
    }

    const rule = ruleMap.get(ruleId);
    if (!rule?.applyCodemod) {
      // Guard 5: skip rules without a codemod (should not happen after fixable filter, but be safe)
      ruleResults.push({ ruleId, count: 0, commitSha: null });
      continue;
    }

    let appliedCount = 0;
    const ruleWarnings: string[] = [];

    for (const finding of findings) {
      const loc = `${finding.location.file}:${finding.location.line}`;
      // Load the current file content for this finding
      const filePath = join(opt.cwd, finding.location.file);
      let fileContent: string;
      try {
        fileContent = await readFile(filePath, "utf8");
      } catch (err) {
        // File disappeared between audit and fix — skip with warning
        ruleWarnings.push(`Skipped finding at ${loc} — file not readable: ${(err as Error).message}`);
        continue;
      }

      const codemodCtx: CodemodContext = {
        ...ctx,
        fileContent,
        parsedAst: null,
      };

      const result = rule.applyCodemod(finding, codemodCtx);

      // Skip if no diff was produced (confidence too low, no token match, etc.)
      if (!result.diff) {
        ruleWarnings.push(`Skipped finding at ${loc} — codemod produced no diff`);
        continue;
      }

      try {
        await applyDiff(opt.cwd, result.diff);
        appliedCount++;
      } catch (err) {
        // If git apply fails, surface as a warning rather than silently swallowing
        ruleWarnings.push(`Skipped finding at ${loc} — git apply failed: ${(err as Error).message}`);
        continue;
      }
    }

    // Guard 5: per-rule commit with descriptive message
    if (appliedCount === 0) {
      if (ruleWarnings.length > 0) {
        ruleResults.push({ ruleId, count: 0, commitSha: null, warnings: ruleWarnings });
      } else {
        ruleResults.push({ ruleId, count: 0, commitSha: null });
      }
      continue;
    }

    const msg = `Lyse: fix ${appliedCount} ${ruleId} finding${appliedCount !== 1 ? "s" : ""} (high confidence)`;
    const sha = await commitAll(opt.cwd, msg);

    // Guard 6: optional test verification — revert commit on test failure
    let testsPassed: boolean | undefined;
    if (opt.verifyWithTests && (await hasTestScript(opt.cwd))) {
      const { passed } = await runTests(opt.cwd);
      testsPassed = passed;
      if (!passed) {
        await revertCommit(opt.cwd, sha);
      }
    }

    if (ruleWarnings.length > 0) {
      ruleResults.push({ ruleId, count: appliedCount, commitSha: sha, testsPassed, warnings: ruleWarnings });
    } else {
      ruleResults.push({ ruleId, count: appliedCount, commitSha: sha, testsPassed });
    }
  }

  // Append to history for each rule that had fixes applied
  for (const result of ruleResults) {
    if (result.count > 0 && result.commitSha) {
      await appendFixEventStore(
        opt.cwd,
        result.ruleId,
        "high",
        result.count,
        result.commitSha,
      );
    }
  }

  return {
    branch: actualBranch,
    ruleResults,
    skipped: {
      medium: grouped.medium.length,
      low: grouped.low.length,
    },
  };
}
