#!/usr/bin/env node
import { defineCommand, renderUsage, runCommand, runMain } from "citty";
import prompts from "prompts";
import { mkdirSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadTokens } from "./loaders/tokens.js";
import { buildComponentInventory } from "./loaders/components.js";
import { renderJson } from "./reporters/json.js";
import { renderSarif } from "./reporters/sarif.js";
import { renderHtml } from "./reporters/html.js";
import { renderTerminal } from "./reporters/terminal.js";
import { formatCoverageFooter } from "./reporters/coverage-footer.js";
import { renderAgentsMd } from "./reporters/markdown.js";
import { renderEslintStyle, fromLegacyFinding } from "./cli/output/eslint-style.js";
import { renderScoreGauge } from "./cli/output/score-gauge.js";
import { resolveLimit } from "./cli/output/limit.js";
import { CURRENT_SCORING_VERSION } from "./reliability/score/version-pin.js";
import { persistCurrentVersion, readMigrationWarning } from "./cli/version-migration.js";
import type { AuditResult, LyseConfig } from "./types.js";
import { VERSION } from "./index.js";
import { RULES_VERSION } from "./rules/manifest.js";
import { checkEntitlement } from "./entitlement/index.js";
import { computeRepoBucket, BUCKET_SALT } from "./identity/index.js";
import { startMcpServer } from "./mcp/server.js";
import { runFix, type FixOptions } from "./commands/fix.js";
import { resolveDryRun, dryRunFlagPresent } from "./commands/dry-run-guard.js";
import { runExplain } from "./commands/explain.js";
import { runExplainScore } from "./commands/explain-score.js";
import { feedbackMissed } from "./commands/feedback.js";
import { auditDirectory, RefuseToRunError } from "./commands/audit-pipeline.js";
import type { AuditFlags } from "./commands/audit-pipeline.js";
import { runShare } from "./commands/share.js";
import { runBadge } from "./commands/badge.js";
import { runInit } from "./commands/init.js";
import { runAddCiGate, AddCiGateError } from "./commands/add-ci-gate.js";
import { maybePromptForEmail, syncPendingEmail } from "./commands/email-prompt.js";
import { runMcpSetup } from "./commands/mcp-setup.js";
import { appendAuditEvent, appendCommandInvokedEvent } from "./history/ndjson-store.js";
import { ensureGitignoreEntry } from "./util/gitignore.js";
import { withSpinner } from "./util/with-spinner.js";
import { showActionMenu } from "./menu/action-menu.js";
import { runRepl, withExitGuard, type ReplActionId, type ReplContext } from "./menu/repl.js";
import { countAutoFixable, buildClassifyContext, populateConfidence } from "./codemods/safety.js";
import { isInteractive, confirm } from "./menu/prompts.js";
import { detectFromFilesystem } from "./detection/from-filesystem.js";
import {
  logAuditStarted,
  logAuditCompleted,
  logFindingDiscovered,
  generateId,
  ensureConsentDecision,
  type LogContext,
} from "./telemetry/index.js";
import { resolveLlmConsent } from "./llm/consent.js";
import { runTelemetryOn, runTelemetryOff, runTelemetryStatus } from "./commands/telemetry.js";
import { runBenchPack } from "./commands/bench-pack.js";

import type { TerminalOpts } from "./reporters/terminal-format.js";

function computeTerminalOpts(
  args: { quiet: boolean; verbose: boolean; "no-color": boolean; output?: string | undefined },
  isTTY: boolean,
  fileCount: number,
  durationMs: number,
  cwd: string,
  hasTokenRegistry: boolean,
  findingsLimit: number | null | undefined,
): TerminalOpts {
  const mode: "default" | "quiet" | "verbose" = args.verbose ? "verbose" : args.quiet ? "quiet" : "default";
  const noColorEnv = typeof process.env["NO_COLOR"] === "string" && process.env["NO_COLOR"] !== "";
  const color = isTTY && !args["no-color"] && !noColorEnv;
  const unicode = (isTTY && process.platform !== "win32") || !!process.env["WT_SESSION"] || !!process.env["TERM_PROGRAM"];
  const width = Math.min(process.stdout.columns ?? 80, 100);
  return {
    mode, color, unicode, width, outDir: args.output, fileCount, durationMs, cwd, hasTokenRegistry,
    ...(findingsLimit !== undefined ? { findingsLimit } : {}),
  };
}

// ---------------------------------------------------------------------------
// ESLint-style text renderer — problems first, score gauge in the footer.
// Spec § 9 + T31: defaults to ESLint-style; --format=legacy restores the older
// gauge-first terminal layout from reporters/terminal.ts.
// ---------------------------------------------------------------------------

function renderEslintStyleAudit(result: AuditResult, limit: number | null | undefined): string {
  const eslintFindings = result.findings.map(fromLegacyFinding);
  const experimental = eslintFindings.filter((f) => f.confidence === "low").length;
  const counted = eslintFindings.length - experimental;
  const sections: string[] = [];
  const findingsBlock = renderEslintStyle({
    findings: eslintFindings,
    counted,
    experimental,
    ...(limit !== undefined ? { limit } : {}),
  });
  if (findingsBlock) sections.push(findingsBlock);
  const gauge = renderScoreGauge(
    result.finalScore,
    CURRENT_SCORING_VERSION,
    counted,
    experimental,
    { toolVersion: result.toolVersion, ...(result.grade ? { grade: result.grade } : {}) },
  );
  sections.push(gauge);
  if (result.meta?.coverage) {
    sections.push(formatCoverageFooter(result.meta.coverage));
  }
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Shared audit pipeline wrapper
// ---------------------------------------------------------------------------

interface AuditOutcome {
  result: AuditResult;
  tokens: Awaited<ReturnType<typeof loadTokens>>;
  config: LyseConfig;
  componentInventory: ReturnType<typeof buildComponentInventory>;
  fileCount: number;
  hasTokenRegistry: boolean;
}

async function runAudit(repoRoot: string, flags?: AuditFlags): Promise<AuditOutcome> {
  const pipeline = await auditDirectory(repoRoot, flags);
  const hasTokenRegistry = !!(pipeline.config.designSystem?.componentsModule);
  // Populate `Finding.confidence` once, here, so every downstream consumer
  // (score gauge experimental counter, ESLint-style EXP tag, JSON/SARIF
  // reporters, telemetry) sees the same classification. The pipeline emits
  // findings without confidence because the classification needs repo-wide
  // context (tokens, components, repoRoot) that's only assembled here.
  const ctx = buildClassifyContext(
    pipeline.result.findings,
    pipeline.tokens,
    pipeline.config,
    repoRoot,
  );
  const result = populateConfidence(pipeline.result, ctx);
  return {
    result,
    tokens: pipeline.tokens,
    config: pipeline.config,
    componentInventory: pipeline.componentInventory,
    fileCount: pipeline.fileCount,
    hasTokenRegistry,
  };
}

// ---------------------------------------------------------------------------
// Global flags helpers
// ---------------------------------------------------------------------------

function applyGlobalFlags(args: Record<string, unknown>): void {
  if (args.yes === true) process.env.LYSE_YES = "1";
  if (args["no-prompt"] === true) process.env.LYSE_NO_PROMPT = "1";
  if (args["no-color"] === true) process.env.NO_COLOR = "1";
  if (args.quiet === true) process.env.LYSE_QUIET = "1";
  // --config <path> overrides .lyse.yaml discovery (Spec § 8).
  // audit-pipeline.ts reads LYSE_CONFIG_PATH before falling back to discovery.
  if (typeof args.config === "string" && args.config) {
    process.env.LYSE_CONFIG_PATH = resolve(args.config);
  }
}

// Global flags shared across every subcommand so they are parsed and applied
// even when citty routes directly to the subcommand's run() without executing
// the parent command's run().
const GLOBAL_FLAGS = {
  yes: { type: "boolean" as const, default: false as boolean, description: "Accept all defaults (no prompts)" },
  "no-prompt": { type: "boolean" as const, default: false as boolean, description: "Refuse prompts; error on missing input" },
  "no-color": { type: "boolean" as const, default: false as boolean, description: "Disable ANSI color output" },
  quiet: { type: "boolean" as const, default: false as boolean, description: "Suppress informational output" },
  config: { type: "string" as const, description: "Path to a config file (overrides .lyse.yaml discovery)" },
};

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

const auditCommand = defineCommand({
  meta: { name: "audit", description: "Audit a repository's design system" },
  args: {
    root: { type: "positional", required: false, default: ".", description: "repository root (defaults to current working directory)" },
    output: { type: "string", description: "output directory (default: stdout)" },
    format: { type: "string", description: "json | text | eslint | legacy | sarif | html (default: text → ESLint-style for tty, json otherwise)" },
    "include-timestamps": { type: "boolean", default: false, description: "include timestamp in JSON output (breaks determinism)" },
    quiet: { type: "boolean", default: false, description: "suppress all stdout except score" },
    verbose: { type: "boolean", default: false, description: "show all findings (default: top 5)" },
    "no-color": { type: "boolean", default: false, description: "disable ANSI color output" },
    limit: {
      type: "string",
      description:
        "Max findings to render in text/eslint/legacy output (default: 10). Use `all` or `0` to show every finding. Ignored by --format=json|sarif.",
    },
    threshold: { type: "string", description: "fail (exit 1) if final score < threshold", default: "0" },
    "static-only": {
      type: "boolean",
      description: "Skip Layer 4 LLM augmentation; report static-only score (~30% coverage)",
    },
    "cost-cap-usd": {
      type: "string",
      description: "Abort if projected LLM cost exceeds this amount (default: $5 local, $1 CI)",
    },
    "no-cache": {
      type: "boolean",
      description: "Ignore the LLM cache; force a fresh LLM call",
    },
    "llm-provider": {
      type: "string",
      description: "Override the LLM provider (anthropic | openai | openai-compat | ollama)",
    },
    "llm-model": {
      type: "string",
      description: "Override the LLM model",
    },
    llm: {
      type: "boolean",
      description:
        "Enable the LLM precision filter for this run (opt-in; sends source to your configured provider)",
    },
    "no-llm": {
      type: "boolean",
      description: "Disable the LLM layer for this run (static-only LLM behaviour)",
    },
    dim: {
      type: "string",
      description:
        "Focus the LLM audit on a single axis (tokens, a11y, components, stories, ai-surface).",
    },
    interactive: {
      type: "boolean",
      default: false,
      description: "after audit, prompt for each finding (y/n/?/s/q) and optionally send verdicts to /v1/feedback (requires `lyse telemetry on`)",
    },
    "no-telemetry": {
      type: "boolean",
      default: false,
      description: "Force-disable telemetry for this single run only (does not change persisted consent)",
    },
    yes: GLOBAL_FLAGS.yes,
    "no-prompt": GLOBAL_FLAGS["no-prompt"],
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const startTime = Date.now();
    const repoRoot = resolve(args.root);

    // T40: one-time warning when migrating from an alpha release. Printed to
    // stderr so it doesn't pollute stdout-captured JSON/SARIF output, and
    // suppressed under --quiet for CI noise hygiene.
    {
      const mig = readMigrationWarning({ currentVersion: VERSION });
      if (mig.warning && args.quiet !== true) {
        process.stderr.write(mig.warning);
      }
      persistCurrentVersion({ currentVersion: VERSION });
    }

    const entitlement = await checkEntitlement("audit");
    if (!entitlement.allowed) {
      console.error(`Feature 'audit' not available on plan '${entitlement.plan}': ${entitlement.reason}`);
      process.exit(2);
    }

    // Resolve telemetry consent (may prompt on first run). Per ADR 0012,
    // never emit on the run that triggered the prompt.
    const consent = await ensureConsentDecision();
    const telemetryActive = consent.accepted && !consent.justAsked && args["no-telemetry"] !== true;

    // Build telemetry context early (only if opt-in and not just asked)
    let telemetryCtx: LogContext | null = null;
    if (telemetryActive) {
      const repoBucket = computeRepoBucket(repoRoot);
      if (repoBucket) {
        telemetryCtx = {
          repoRoot,
          sessionId: generateId(),
          repoBucket,
          sdkVersion: VERSION,
          rulesVersion: RULES_VERSION,
          salt: BUCKET_SALT,
        };
      }
    }

    // Build flag overrides from CLI args.
    const auditFlags: AuditFlags = {
      ...(args["static-only"] === true ? { staticOnly: true } : {}),
      ...(typeof args["cost-cap-usd"] === "string" && args["cost-cap-usd"]
        ? { costCapUsd: parseFloat(args["cost-cap-usd"] as string) }
        : {}),
      ...(args["no-cache"] === true ? { noCache: true } : {}),
      ...(typeof args["llm-provider"] === "string" && args["llm-provider"]
        ? { llmProvider: args["llm-provider"] as string }
        : {}),
      ...(typeof args["llm-model"] === "string" && args["llm-model"]
        ? { llmModel: args["llm-model"] as string }
        : {}),
      ...(typeof args["dim"] === "string" && args["dim"]
        ? { llmDimension: (args["dim"] as string).trim().toLowerCase() }
        : {}),
    };

    // #115: resolve LLM consent once, in the CLI layer (mirrors telemetry).
    // --no-llm wins; --llm opts in for this run; otherwise env/persisted/prompt.
    // The result gates the connector auto-detect path (resolver.ts).
    const llmFlag =
      args["no-llm"] === true ? false : args["llm"] === true ? true : undefined;
    auditFlags.llmConsented = await resolveLlmConsent(
      llmFlag === undefined ? undefined : { llm: llmFlag },
    );

    // Issue #97 — visual feedback. Compute spinner enablement BEFORE running
    // the audit so we can surface phase progress. The format default mirrors
    // the post-audit logic below (TTY → "text", else "json") so we suppress
    // the spinner whenever stdout receives machine-readable output.
    const isTTYForSpinner = process.stdout.isTTY ?? false;
    const formatForSpinner = args.format ?? (isTTYForSpinner ? "text" : "json");
    const isQuiet = args.quiet === true;
    const isMachineFormatForSpinner =
      formatForSpinner === "json" || formatForSpinner === "sarif" || formatForSpinner === "html";

    let result: AuditResult, fileCount: number, hasTokenRegistry: boolean;
    let tokens: AuditOutcome["tokens"], config: AuditOutcome["config"];
    try {
      ({ result, fileCount, hasTokenRegistry, tokens, config } = await withSpinner<AuditOutcome>(
        {
          isTTY: isTTYForSpinner,
          quiet: isQuiet,
          machineFormat: isMachineFormatForSpinner,
          startLabel: "Discovering files…",
          successLabel: (r) => {
            const elapsedSec = Math.round((Date.now() - startTime) / 100) / 10;
            return (
              `Audit complete · ${r.result.findings.length} findings · ` +
              `score ${r.result.finalScore}/100 · tier ${r.result.tier} · ${elapsedSec}s`
            );
          },
          failLabel: (m) => `Audit failed: ${m}`,
        },
        async (spinner) => {
          const flagsWithProgress: AuditFlags = { ...auditFlags, progress: spinner };
          return runAudit(repoRoot, flagsWithProgress);
        },
      ));
    } catch (err) {
      if (err instanceof RefuseToRunError) {
        console.error(`[lyse] ${err.message}`);
        process.exit(1);
      }
      throw err;
    }

    // Emit telemetry events (all after runAudit so stack is known; semantics refined in V0.2)
    if (telemetryCtx) {
      const stack: { framework?: string; ds_detected?: string } = {};
      if (result.stack[0]) stack.framework = result.stack[0];
      if (result.stack[1]) stack.ds_detected = result.stack[1];
      logAuditStarted(telemetryCtx, stack);
      logAuditCompleted(telemetryCtx, Date.now() - startTime, result);
      for (const f of result.findings) logFindingDiscovered(telemetryCtx, f);
    }

    // Ensure .lyse/ is in .gitignore before writing history (idempotent guard against untracked-dirty)
    await ensureGitignoreEntry(repoRoot, ".lyse/");

    // Append audit event to history (for delta display)
    const tokensScore = result.axes.find((a) => a.axis === "tokens")?.score;
    const a11yScore = result.axes.find((a) => a.axis === "a11y")?.score;
    const componentsScore = result.axes.find((a) => a.axis === "components")?.score;
    const storiesScore = result.axes.find((a) => a.axis === "stories")?.score;

    await appendAuditEvent(repoRoot, {
      score: typeof result.finalScore === "number" ? result.finalScore : 0,
      axes: {
        tokens: typeof tokensScore === "number" ? tokensScore : null,
        a11y: typeof a11yScore === "number" ? a11yScore : null,
        components: typeof componentsScore === "number" ? componentsScore : null,
        stories: typeof storiesScore === "number" ? storiesScore : null,
      },
      findings_count: result.findings.length,
    }, null);

    const isTTY = process.stdout.isTTY ?? false;
    const format = args.format ?? (isTTY ? "text" : "json");

    // Resolve --limit for text/eslint/legacy output. JSON/SARIF intentionally
    // ignore the flag (machine consumers want the full report, always). When
    // the user doesn't pass --limit, the per-format default differs:
    //   legacy      → undefined, so terminal.ts falls back to its historical
    //                 top-5 / verbose=all behavior;
    //   text/eslint → null (unlimited) — eslint-style already lists findings
    //                 as a flat block; users see every finding by default and
    //                 pass --limit=N to truncate.
    let textFindingsLimit: number | null | undefined;
    try {
      textFindingsLimit = resolveLimit(args, format === "eslint" ? null : undefined);
    } catch (err) {
      console.error(`[lyse] ${(err as Error).message}`);
      process.exit(64); // EX_USAGE
    }

    if (format === "sarif") {
      const sarifContent = renderSarif(result, { includeTimestamp: !!args["include-timestamps"] });
      if (args.output) {
        const outDir = resolve(args.output);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "lyse.sarif"), sarifContent);
      } else {
        process.stdout.write(sarifContent);
      }
    } else if (format === "html") {
      const htmlContent = renderHtml(result, { includeTimestamp: !!args["include-timestamps"] });
      if (args.output) {
        const outDir = resolve(args.output);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "lyse.html"), htmlContent);
      } else {
        process.stdout.write(htmlContent);
      }
    } else {
      const jsonContent = renderJson(result, { includeTimestamp: !!args["include-timestamps"] });

      const isTextFormat = format === "text" || format === "eslint" || format === "legacy";

      const renderTextForStdout = async (): Promise<string> => {
        if (format === "eslint") {
          return renderEslintStyleAudit(result, textFindingsLimit) + "\n";
        }
        const opts = computeTerminalOpts(args, isTTY, fileCount, Date.now() - startTime, repoRoot, hasTokenRegistry, textFindingsLimit);
        return (await renderTerminal(result, opts)) + "\n";
      };

      if (args.output) {
        // File mode — write files; only emit text to stdout if format=text|eslint|legacy.
        const outDir = resolve(args.output);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "lyse.json"), jsonContent);
        if (isTextFormat) {
          process.stdout.write(await renderTextForStdout());
        }
      } else {
        // Stdout mode — print exactly one format.
        if (format === "json") {
          process.stdout.write(jsonContent);
        } else {
          process.stdout.write(await renderTextForStdout());
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Post-audit action menu (spec § 6.9 + § 9) + interactive feedback (T23).
    // Skip when: --quiet, non-TTY / CI, --format=json|sarif (machine output),
    // --no-prompt (refuse prompts), --yes (accept defaults — auto-skip prompts).
    // ---------------------------------------------------------------------------
    const isMachineFormat = format === "json" || format === "sarif";
    const promptsAllowed =
      !args.quiet &&
      !isMachineFormat &&
      isInteractive() &&
      args["no-prompt"] !== true &&
      args.yes !== true;
    const wantsFeedback =
      args.interactive === true && promptsAllowed && result.findings.length > 0;

    // Once-per-machine opt-in email capture for release & security updates.
    // Short-circuits on --yes / CI / non-TTY / LYSE_NO_EMAIL_PROMPT=1 / when
    // ~/.lyse/profile.json already records a decision. `syncPendingEmail`
    // runs always (incl. non-TTY) to retry any captured-but-undelivered email.
    if (promptsAllowed) {
      await maybePromptForEmail({ yes: Boolean(args.yes) });
    }
    await syncPendingEmail();

    if (promptsAllowed && !wantsFeedback) {
      // Standard action menu path (no --interactive, or no findings).
      const autoFixableCount = countAutoFixable(result.findings, tokens, config, repoRoot);
      const fsDetect = await detectFromFilesystem(repoRoot);
      const detectedIDE = !!(fsDetect.cursor.value || fsDetect.claudeCode.value);

      const choice = await showActionMenu({ autoFixableCount, detectedIDE });

      if (choice === "fix") {
        await runFix({ cwd: repoRoot, autoApprove: Boolean(args.yes) });
      } else if (choice === "mcp-setup") {
        await runMcpSetup({ cwd: repoRoot, autoApprove: Boolean(args.yes) });
      }
    } else if (wantsFeedback) {
      // --interactive mode: skip the action menu and go straight to per-finding
      // feedback prompts. Consent is governed by ADR 0012 (~/.lyse/consent.json);
      // the prior banner-based ack has been retired.
      const { runInteractiveFeedback } = await import("./reliability/feedback/interactive.js");
      await runInteractiveFeedback({ findings: result.findings, repoRoot });
    }

    // Exit code logic — sysexits.h-style
    const threshold = parseInt(String(args.threshold ?? "0"), 10);
    if (Number.isNaN(threshold)) {
      console.error(`Invalid --threshold value: ${args.threshold}`);
      process.exit(64); // EX_USAGE
    }

    // Emit command_invoked metric (opt-in, only when consent has been accepted)
    const didFail = typeof result.finalScore === "number" && result.finalScore < threshold;
    await appendCommandInvokedEvent(repoRoot, "audit", didFail ? "error" : "success", Date.now() - startTime);

    if (didFail) {
      process.exit(1);
    }
    // Implicit exit 0 (success)
  },
});

// Shared handler for agents command and agents-md alias
// Design note: `lyse agents` writes to stdout by default; users redirect to
// AGENTS.md themselves (shell handles overwrites). When --output <path> is
// provided, WE write the file and must prompt before clobbering an existing
// one. --yes bypasses the prompt; --no-prompt errors out cleanly in CI.
async function agentsHandler({ args }: { args: Record<string, unknown> }): Promise<void> {
  applyGlobalFlags(args);
  const entitlement = await checkEntitlement("agents");
  if (!entitlement.allowed) {
    console.error(`Feature 'agents' not available on plan '${entitlement.plan}': ${entitlement.reason}`);
    process.exit(2);
  }

  const repoRoot = resolve((args.root as string) ?? ".");
  const agentFlags: AuditFlags = {
    ...(args["static-only"] === true ? { staticOnly: true } : {}),
  };
  const { result, tokens, componentInventory } = await runAudit(repoRoot, agentFlags);
  const namespaces: string[] = [];
  if (tokens) {
    if (tokens.colors.size > 0) namespaces.push("color/*");
    if (tokens.spacing.size > 0) namespaces.push("spacing/*");
  }
  const md = renderAgentsMd(result, {
    tokenNamespaces: namespaces,
    components: componentInventory.map((c) => c.name),
  });

  if (args.output) {
    const outputPath = resolve(args.output as string);
    let fileExists = false;
    try {
      await access(outputPath);
      fileExists = true;
    } catch {
      // File doesn't exist — safe to write
    }

    if (fileExists) {
      // --yes bypasses prompt; --no-prompt errors when can't prompt interactively
      if (process.env.LYSE_YES === "1") {
        // Auto-approved — overwrite silently
      } else if (process.env.LYSE_NO_PROMPT === "1") {
        console.error(`${outputPath} exists. Use --yes to overwrite.`);
        process.exit(1);
      } else {
        const ok = await confirm(`${outputPath} exists. Overwrite?`, false);
        if (!ok) {
          console.log("Aborted (existing file preserved).");
          return;
        }
      }
    }

    writeFileSync(outputPath, md);
    console.log(`Wrote ${outputPath}`);
  } else {
    process.stdout.write(md);
  }
}

const agentsCommand = defineCommand({
  meta: { name: "agents", description: "Generate AGENTS.md from the project at <path>" },
  args: {
    root: { type: "positional", required: false, default: ".", description: "repository root" },
    output: { type: "string", description: "write to file (default: stdout)" },
    "static-only": {
      type: "boolean",
      description: "Skip Layer 4 LLM augmentation; use static-only findings",
    },
    ...GLOBAL_FLAGS,
  },
  run: agentsHandler,
});

const agentsMdCommand = defineCommand({
  meta: { name: "agents-md", description: "DEPRECATED: use `lyse agents`" },
  args: {
    root: { type: "positional", required: false, default: ".", description: "repository root" },
    output: { type: "string", description: "write to file (default: stdout)" },
    "static-only": {
      type: "boolean",
      description: "Skip Layer 4 LLM augmentation; use static-only findings",
    },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    process.stderr.write(
      "WARNING: `lyse agents-md` is deprecated. Use `lyse agents` instead. (Alias removed in v0.2.)\n"
    );
    await agentsHandler({ args });
  },
});

const versionCommand = defineCommand({
  meta: { name: "version", description: "Print tool, rules, and schema versions" },
  args: { ...GLOBAL_FLAGS },
  async run({ args }) {
    applyGlobalFlags(args);
    process.stdout.write(
      [
        `lyse ${VERSION}`,
        `rules ${RULES_VERSION}`,
        `schema-versions: result=2, event=1.0.0, config=1.0.0, license=1.0.0, rules=1.0.0`,
        "",
      ].join("\n"),
    );
  },
});

// ---------------------------------------------------------------------------
// explain subcommand
// ---------------------------------------------------------------------------

const explainCommand = defineCommand({
  meta: { name: "explain", description: "Show rationale for a rule, or the score breakdown (--score)" },
  args: {
    ruleId: { type: "positional", required: false, description: "rule id (e.g. tokens/no-hardcoded-color), or a repo path with --score (default: cwd)" },
    score: { type: "boolean", default: false, description: "Show a Lighthouse-style score breakdown of the target repo's Health Score" },
    "static-only": { type: "boolean", default: false, description: "(with --score) skip the LLM augmentation step" },
    format: { type: "string", default: "text", description: "text | md (default: text)" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    if (args.score === true) {
      // With --score the positional is a repo PATH (not a ruleId); default to cwd.
      const target =
        typeof args.ruleId === "string" && args.ruleId.length > 0 ? args.ruleId : process.cwd();
      await runExplainScore({
        cwd: target,
        ...(args["static-only"] === true ? { staticOnly: true } : {}),
      });
      return;
    }
    if (typeof args.ruleId !== "string" || args.ruleId.length === 0) {
      process.stderr.write(
        "Usage: lyse explain <ruleId>\n   or: lyse explain --score [--static-only]\n",
      );
      process.exitCode = 64;
      return;
    }
    await runExplain({ cwd: process.cwd(), ruleId: args.ruleId, format: args.format });
  },
});

async function requireMcpServerEntitlement(): Promise<void> {
  const entitlement = await checkEntitlement("mcp_server");
  if (!entitlement.allowed) {
    console.error(`Feature 'mcp_server' not available on plan '${entitlement.plan}': ${entitlement.reason}`);
    process.exit(2);
  }
}

const mcpCommand = defineCommand({
  meta: { name: "mcp", description: "MCP server for AI agents" },
  subCommands: {
    setup: defineCommand({
      meta: { name: "setup", description: "Configure your IDE's MCP file" },
      args: {
        path: { type: "positional", required: false, default: ".", description: "repository root" },
        target: { type: "string", description: "cursor | claude-code | copilot | both | all" },
        dev: { type: "boolean", description: "Force absolute-path entry (auto-detected when running from a local build)." },
        ...GLOBAL_FLAGS,
      },
      async run({ args }) {
        applyGlobalFlags(args);
        const { resolve } = await import("node:path");
        const yes = Boolean(args.yes);
        const opts = {
          cwd: resolve(String(args.path ?? ".")),
          autoApprove: yes,
        } as Parameters<typeof runMcpSetup>[0];
        if (typeof args.target === "string") {
          opts.target = args.target as "cursor" | "claude-code" | "copilot" | "both" | "all";
        }
        if (args.dev === true) {
          opts.dev = true;
        }
        const isQuiet = args.quiet === true;
        await withSpinner(
          {
            quiet: isQuiet,
            startLabel: "Writing MCP config…",
            successLabel: () => "MCP configured",
            failLabel: (m) => `MCP setup failed: ${m}`,
          },
          async () => runMcpSetup(opts),
        );
      },
    }),
    serve: defineCommand({
      meta: {
        name: "serve",
        description:
          "Start the MCP stdio server (this is what `.mcp.json` / `.cursor/mcp.json` invoke).",
      },
      async run() {
        await requireMcpServerEntitlement();
        await startMcpServer();
      },
    }),
  },
  async run() {
    await requireMcpServerEntitlement();
    await startMcpServer();
  },
});

const fixCommand = defineCommand({
  meta: { name: "fix", description: "Auto-fix design system violations with confidence gates and safety guards" },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    "dry-run": { type: "boolean", default: false, description: "preview changes without writing or committing (the default in non-TTY contexts; pass --no-dry-run to apply fixes there)" },
    interactive: { type: "boolean", default: false, description: "enable interactive prompts" },
    confidence: { type: "string", default: "high", description: "confidence floor: high | medium | low" },
    rule: { type: "string", description: "limit fixes to a specific rule ID" },
    "force-on-dirty": { type: "boolean", default: false, description: "allow running on a dirty working tree" },
    "verify-with-tests": { type: "boolean", default: false, description: "run tests after each rule batch; revert on failure" },
    branch: { type: "string", description: "override the branch name (useful for tests)" },
    scaffold: { type: "boolean", default: false, description: "generate missing AI-readiness files (llms.txt, AGENTS.md, value-gate doc)" },
    "migrate-tokens": { type: "boolean", default: false, description: "migrate legacy ({ value, type }) token JSON to DTCG ({ $value, $type }); skips files that wouldn't be conformant" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const entitlement = await checkEntitlement("fix");
    if (!entitlement.allowed) {
      console.error(`Feature 'fix' not available on plan '${entitlement.plan}': ${entitlement.reason}`);
      process.exit(2);
    }

    const cwd = resolve(args.path ?? ".");
    // Guard 6: in a non-TTY context (CI, pipe) default to dry-run so an
    // unattended invocation never mutates + commits the repo. An explicit
    // --dry-run / --no-dry-run always wins.
    const isTTY = process.stdout.isTTY ?? false;
    const flagPresent = dryRunFlagPresent(process.argv);
    const dryRun = resolveDryRun({ flagPresent, flagValue: args["dry-run"], isTTY });
    if (dryRun && !flagPresent && !isTTY) {
      process.stderr.write(
        "[lyse] Non-interactive context — defaulting to --dry-run (no files written, no commit). Pass --no-dry-run to apply fixes.\n",
      );
    }
    const opts: FixOptions = {
      cwd,
      dryRun,
      interactive: args.interactive,
      confidence: (args.confidence ?? "high") as "high" | "medium" | "low",
      rule: args.rule,
      forceOnDirty: args["force-on-dirty"],
      verifyWithTests: args["verify-with-tests"],
      branch: args.branch,
      scaffold: args.scaffold,
      migrateTokens: args["migrate-tokens"],
    };

    const isQuiet = args.quiet === true;
    const result = await withSpinner(
      {
        quiet: isQuiet,
        startLabel: "Discovering files…",
        successLabel: () => "Fix complete",
        failLabel: (m) => `Fix failed: ${m}`,
      },
      async () => runFix(opts),
    );
    console.log(`✓ Branch: ${result.branch}`);
    for (const r of result.ruleResults) {
      const testStatus =
        r.testsPassed === false ? " (tests failed, reverted)" : r.testsPassed === true ? " (tests passed)" : "";
      console.log(`✓ ${r.ruleId}: ${r.count} fixes${testStatus}`);
      if (r.warnings && r.warnings.length > 0) {
        for (const w of r.warnings) {
          process.stderr.write(`  ⚠ ${w}\n`);
        }
      }
    }
    if (result.scaffolds.length > 0) {
      const verb = args["dry-run"] ? "Would scaffold" : "Scaffolded";
      console.log(`✓ ${verb} ${result.scaffolds.length} AI-readiness file(s): ${result.scaffolds.join(", ")}`);
    } else if (args.scaffold) {
      console.log("✓ Scaffold: all AI-readiness files already present.");
    }
    if (result.migratedTokens.length > 0) {
      const verb = args["dry-run"] ? "Would migrate" : "Migrated";
      console.log(`✓ ${verb} ${result.migratedTokens.length} token file(s) to DTCG: ${result.migratedTokens.join(", ")}`);
    } else if (args["migrate-tokens"]) {
      console.log("✓ Migrate-tokens: no convertible legacy token files found.");
    }
    if (result.skipped.medium > 0 || result.skipped.low > 0) {
      console.log(`  Skipped: ${result.skipped.medium} medium-confidence, ${result.skipped.low} low-confidence findings`);
      console.log(`  Use --confidence=medium or --interactive to review.`);
    }
  },
});

const shareCommand = defineCommand({
  meta: { name: "share", description: "Audit + copy Markdown summary to clipboard" },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const entitlement = await checkEntitlement("share");
    if (!entitlement.allowed) {
      console.error(`Feature 'share' not available on plan '${entitlement.plan}': ${entitlement.reason}`);
      process.exit(2);
    }

    const cwd = resolve(args.path ?? ".");
    await runShare(cwd, { quiet: args.quiet === true });
  },
});

const badgeCommand = defineCommand({
  meta: { name: "badge", description: "Audit + print a shields.io Health Score badge for your README" },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    write: { type: "boolean", description: "Also write .lyse/badge.json (shields.io endpoint, auto-updating via CI)" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const cwd = resolve(args.path ?? ".");
    await runBadge(cwd, { write: args.write === true, quiet: args.quiet === true });
  },
});

const initCommand = defineCommand({
  meta: { name: "init", description: "Interactive wizard for first-time setup" },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    "first-run": { type: "boolean", description: "mark as first run (used by npm create lyse)" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const { resolve } = await import("node:path");
    const isQuiet = args.quiet === true;
    await withSpinner(
      {
        quiet: isQuiet,
        startLabel: "Detecting framework…",
        successLabel: () => "Initialized .lyse.yaml + AGENTS.md",
        failLabel: (m) => `Init failed: ${m}`,
      },
      async () => runInit({
        cwd: resolve(args.path ?? "."),
        firstRun: args["first-run"],
        yes: Boolean(args.yes),
      }),
    );
  },
});

const addCommand = defineCommand({
  meta: { name: "add", description: "Add a Lyse feature to your repo (CI gate, etc.)" },
  subCommands: {
    "ci-gate": defineCommand({
      meta: {
        name: "ci-gate",
        description: "Install the Lyse score-regression CI gate (.github/workflows/lyse.yml + .github/scripts/lyse-gate.mjs)",
      },
      args: {
        path: { type: "positional", required: false, default: ".", description: "repository root" },
        threshold: { type: "string", description: "max allowed score drop before the gate fails (default 0)" },
        "lyse-version": { type: "string", description: "Lyse CLI version the workflow should pin (default: the running CLI version)" },
        force: { type: "boolean", default: false, description: "overwrite existing files" },
        "force-not-a-repo": {
          type: "boolean",
          default: false,
          description: "bypass the .git/ or package.json project-root check",
        },
        ...GLOBAL_FLAGS,
      },
      async run({ args }) {
        applyGlobalFlags(args);
        const cwd = resolve(String(args.path ?? "."));
        try {
          const opts: Parameters<typeof runAddCiGate>[0] = { cwd };
          if (typeof args.threshold === "string") opts.threshold = Number(args.threshold);
          if (typeof args["lyse-version"] === "string") opts.lyseVersion = args["lyse-version"];
          if (args.force === true) opts.force = true;
          if (args["force-not-a-repo"] === true) opts.forceNotARepo = true;
          const result = runAddCiGate(opts);
          if (args.quiet !== true) {
            for (const p of result.written) process.stdout.write(`Wrote ${p}\n`);
            for (const s of result.skipped) process.stdout.write(`Skipped ${s.path} — ${s.reason}\n`);
            if (result.written.length > 0) {
              process.stdout.write(
                "\nNext: commit these files and open a PR. Lyse will audit every subsequent PR.\n",
              );
            }
          }
        } catch (e) {
          if (e instanceof AddCiGateError) {
            process.stderr.write(`lyse add ci-gate: ${e.message}\n`);
            process.exit(2);
          }
          throw e;
        }
      },
    }),
  },
});

const feedbackCommand = defineCommand({
  meta: {
    name: "feedback",
    description: "Send feedback on missed findings to the hand-label queue (requires `lyse telemetry on`)",
  },
  args: {
    missed: { type: "string", description: "<file>:<line> the auditor missed", required: true },
    "sub-axis": { type: "string", description: "Sub-axis ID you expected to catch this (e.g. tokens.color)" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const cwd = resolve(process.cwd());
    const autoConfirm = Boolean(args.yes);
    const subAxisId = typeof args["sub-axis"] === "string" ? args["sub-axis"] : undefined;
    const fbArgs: Parameters<typeof feedbackMissed>[0] = {
      cwd,
      missed: args.missed,
      autoConfirm,
    };
    if (subAxisId !== undefined) fbArgs.subAxisId = subAxisId;
    const r = await feedbackMissed(fbArgs);
    if (!r.ok) process.exitCode = 1;
  },
});

const telemetryCommand = defineCommand({
  meta: {
    name: "telemetry",
    description: "Manage anonymous telemetry consent (see PRIVACY.md)",
  },
  subCommands: {
    on: defineCommand({
      meta: { name: "on", description: "Enable anonymous telemetry" },
      run() {
        runTelemetryOn();
      },
    }),
    off: defineCommand({
      meta: { name: "off", description: "Disable anonymous telemetry" },
      run() {
        runTelemetryOff();
      },
    }),
    status: defineCommand({
      meta: { name: "status", description: "Show current telemetry consent state" },
      run() {
        runTelemetryStatus();
      },
    }),
  },
});

const benchPackCommand = defineCommand({
  meta: { name: "bench-pack", description: "Emit a deterministic evidence pack (JSON) for submission to the public benchmark" },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    output: { type: "string", default: "evidence-pack.json", description: "output JSON path" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const isQuiet = args.quiet === true;
    await withSpinner(
      {
        quiet: isQuiet,
        startLabel: "Packing benchmark…",
        successLabel: () => "Bench pack written",
        failLabel: (m) => `Bench pack failed: ${m}`,
      },
      async () => runBenchPack({ cwd: resolve(args.path ?? "."), output: args.output }),
    );
  },
});

// ---------------------------------------------------------------------------
// Root-level REPL dispatch — when `lyse` is invoked without a subcommand on a
// TTY, an interactive menu lets the user pick an action (audit, fix, mcp-setup,
// explain, bench-pack, telemetry) and loops back to itself after each run. On
// non-TTY (CI, pipe) or when `--no-menu` / `LYSE_NO_MENU=1` is set, the menu is
// skipped and the standard help text is printed instead.
// ---------------------------------------------------------------------------

async function dispatchReplAction(action: ReplActionId, ctx: ReplContext): Promise<void> {
  switch (action) {
    case "audit":
      await withExitGuard(() => runCommand(auditCommand, { rawArgs: [ctx.cwd] }));
      return;
    case "fix":
      await withExitGuard(() => runCommand(fixCommand, { rawArgs: [ctx.cwd] }));
      return;
    case "mcp-setup":
      await withExitGuard(() => runCommand(mcpCommand, { rawArgs: ["setup", ctx.cwd] }));
      return;
    case "explain": {
      const r = await prompts({
        type: "text",
        name: "v",
        message: "Rule ID (e.g. tokens/no-hardcoded-color, blank to cancel):",
      });
      const ruleId = typeof r.v === "string" ? r.v.trim() : "";
      if (!ruleId) return;
      await withExitGuard(() => runCommand(explainCommand, { rawArgs: [ruleId] }));
      return;
    }
    case "bench-pack":
      await withExitGuard(() => runCommand(benchPackCommand, { rawArgs: [ctx.cwd] }));
      return;
    case "telemetry": {
      const r = await prompts({
        type: "select",
        name: "v",
        message: "Telemetry:",
        choices: [
          { title: "Status — show current consent", value: "status" },
          { title: "On — opt in to anonymous telemetry", value: "on" },
          { title: "Off — opt out", value: "off" },
          { title: "Back", value: "back" },
        ],
      });
      if (!r.v || r.v === "back") return;
      await withExitGuard(() => runCommand(telemetryCommand, { rawArgs: [r.v as string] }));
      return;
    }
    case "exit":
      return;
  }
}

const main = defineCommand({
  meta: { name: "lyse", version: VERSION, description: "Audit your design system" },
  args: {
    yes: { type: "boolean", description: "Accept all defaults (no prompts)" },
    "no-prompt": { type: "boolean", description: "Refuse prompts; error on missing input" },
    "no-color": { type: "boolean", description: "Disable ANSI color output" },
    quiet: { type: "boolean", description: "Suppress informational output" },
    "no-menu": { type: "boolean", description: "Skip the interactive menu (print help instead)" },
  },
  subCommands: { init: initCommand, audit: auditCommand, fix: fixCommand, add: addCommand, share: shareCommand, badge: badgeCommand, agents: agentsCommand, "agents-md": agentsMdCommand, "bench-pack": benchPackCommand, version: versionCommand, explain: explainCommand, mcp: mcpCommand, feedback: feedbackCommand, telemetry: telemetryCommand },
  async run({ args, cmd, rawArgs }) {
    applyGlobalFlags(args);

    // citty calls parent.run() AFTER the matched subcommand finishes — so
    // detect when a subcommand was invoked (first non-flag in rawArgs) and
    // bow out cleanly. Otherwise our help / REPL would print AFTER the
    // subcommand's stdout (breaking audit's JSON / SARIF / mcp-serve output).
    const subCommands = cmd.subCommands as Record<string, unknown> | undefined;
    if (subCommands) {
      const firstPositional = rawArgs.find((a) => !a.startsWith("-"));
      if (firstPositional && firstPositional in subCommands) return;
    }

    const noMenu = args["no-menu"] === true || process.env.LYSE_NO_MENU === "1";
    if (noMenu || !isInteractive()) {
      // Use renderUsage + process.stdout.write rather than citty's showUsage
      // because the latter routes through consola, which silently drops output
      // when CI=true is set in the env (regression-proofs CI/test environments).
      process.stdout.write((await renderUsage(cmd)) + "\n");
      return;
    }
    await runRepl(
      { cwd: process.cwd(), quiet: args.quiet === true, version: VERSION },
      dispatchReplAction,
    );
  },
});

runMain(main);
