#!/usr/bin/env node
import { defineCommand, renderUsage, runCommand, runMain } from "citty";
import { mkdirSync, writeFileSync } from "node:fs";
import { access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadTokens } from "./loaders/tokens.js";
import { buildComponentInventory } from "./loaders/components.js";
import { renderJson } from "./reporters/json.js";
import { renderSarif } from "./reporters/sarif.js";
import { renderHtml } from "./reporters/html.js";
import { renderTsv } from "./reporters/tsv.js";
import { renderTable } from "./reporters/table.js";
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
import { runExplain } from "./commands/explain.js";
import { runExplainScore } from "./commands/explain-score.js";
import { feedbackMissed } from "./commands/feedback.js";
import { auditDirectory, RefuseToRunError, ScopeError } from "./commands/audit-pipeline.js";
import type { AuditFlags } from "./commands/audit-pipeline.js";
import { resolveScoreModel } from "./scorer.js";
import { runShare } from "./commands/share.js";
import { runBadge } from "./commands/badge.js";
import { runInit } from "./commands/init.js";
import { runAddCiGate, AddCiGateError } from "./commands/add-ci-gate.js";
import { runAddGitHook, AddGitHookError } from "./commands/add-git-hook.js";
import { runInstall } from "./commands/install.js";
import { syncPendingEmail } from "./commands/email-prompt.js";
import { runMcpSetup } from "./commands/mcp-setup.js";
import { appendAuditEvent, appendCommandInvokedEvent } from "./history/ndjson-store.js";
import { ensureLyseGitignore } from "./util/lyse-gitignore.js";
import { withSpinner } from "./util/with-spinner.js";
import { showActionMenu } from "./menu/action-menu.js";
import { buildClassifyContext, populateConfidence } from "./codemods/safety.js";
import { isInteractive, confirm } from "./menu/prompts.js";
import { detectFromFilesystem } from "./detection/from-filesystem.js";
import {
  logAuditStarted,
  logAuditCompleted,
  logFindingDiscovered,
  generateId,
  ensureConsentDecision,
  resolveConsentNonInteractive,
  type LogContext,
} from "./telemetry/index.js";
import { resolveLlmConsentNonInteractive } from "./llm/consent.js";
import { runTelemetryOn, runTelemetryOff, runTelemetryStatus } from "./commands/telemetry.js";
import { runBenchPack } from "./commands/bench-pack.js";
import { runHandoffCommand } from "./commands/handoff.js";
import { runBaselineWrite } from "./commands/baseline.js";
import { readBaseline, BaselineError } from "./diff/baseline.js";
import { selectNew } from "./diff/delta.js";
import { evaluateGate } from "./diff/gate.js";
import { stableRuleIds } from "./reliability/score/stable-sub-axes.js";
import { SUB_AXES } from "./reliability/catalogue/sub-axes.js";
import { writeGraph } from "./graph/persist.js";
import type { DesignSystemGraph } from "./graph/types.js";

import type { TerminalOpts } from "./reporters/terminal-format.js";

function computeTerminalOpts(
  args: { quiet: boolean; verbose: boolean; "no-color": boolean; output?: string | undefined },
  isTTY: boolean,
  fileCount: number,
  durationMs: number,
  cwd: string,
  hasTokenRegistry: boolean,
  findingsLimit: number | null | undefined,
  migrationScaleFileCount?: number,
): TerminalOpts {
  const mode: "default" | "quiet" | "verbose" = args.verbose ? "verbose" : args.quiet ? "quiet" : "default";
  const noColorEnv = typeof process.env["NO_COLOR"] === "string" && process.env["NO_COLOR"] !== "";
  const color = isTTY && !args["no-color"] && !noColorEnv;
  const unicode = (isTTY && process.platform !== "win32") || !!process.env["WT_SESSION"] || !!process.env["TERM_PROGRAM"];
  const width = Math.min(process.stdout.columns ?? 80, 100);
  return {
    mode, color, unicode, width, outDir: args.output, fileCount, durationMs, cwd, hasTokenRegistry,
    ...(findingsLimit !== undefined ? { findingsLimit } : {}),
    ...(migrationScaleFileCount !== undefined ? { migrationScaleFileCount } : {}),
  };
}

// ---------------------------------------------------------------------------
// ESLint-style text renderer — problems first, score gauge in the footer.
// Opt-in via --format=eslint; the default text view is the gauge-first doctor
// layout from reporters/terminal.ts (also reachable as --format=legacy).
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
  graph: DesignSystemGraph;
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
    // The SAME resolver the rules ran against. Without it the token-axis hooks
    // fall back to the flat TokenMap, which cannot see CSS custom properties or
    // SCSS variables, and demote a genuine `exact` to `low`.
    pipeline.resolver,
  );
  const result = populateConfidence(pipeline.result, ctx);
  return {
    result,
    tokens: pipeline.tokens,
    config: pipeline.config,
    componentInventory: pipeline.componentInventory,
    fileCount: pipeline.fileCount,
    hasTokenRegistry,
    graph: pipeline.graph,
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
    format: { type: "string", description: "json | text | table | tsv | eslint | legacy | sarif | html (default: text for tty, json otherwise)" },
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
    scope: {
      type: "string",
      description: "Limit findings: `changed`/`staged`/`uncommitted` (git file scope), or `new` (only findings absent from .lyse/baseline.json). Default: whole tree.",
    },
    staged: {
      type: "boolean",
      default: false,
      description: "Shortcut for --scope=staged (audit only staged files; ideal for pre-commit hooks).",
    },
    base: {
      type: "string",
      description: "Base ref for --scope=changed (default: origin/main).",
    },
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
    render: {
      type: "boolean",
      default: false,
      description: "Opt-in: render the design system in headless Chromium (token-fidelity drift + axe-core a11y on a pre-built Storybook). Requires Playwright.",
    },
    storybook: {
      type: "string",
      description: "Storybook source for runtime a11y: a pre-built static dir (e.g. storybook-static) or a running URL. Used only with --render.",
    },
    "score-model": {
      type: "string",
      description: "Scoring model: v3 (default) or v2 (legacy escape hatch, removed after one minor).",
    },
    "graph-full": {
      type: "boolean",
      default: false,
      description: "Persist the full graph (per-file usage edges) to .lyse/graph.json",
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
    let newScopeGateFail = false;
    let newScopeGateReasons: string[] = [];

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

    // Validate --score-model / LYSE_SCORE_MODEL at the CLI boundary so a bad
    // value yields a clean [lyse] Error (exit 64), not a raw stack trace from
    // resolveScoreModel deep in the pipeline. Config `scoring.model` is
    // already validated by loadConfig's zod enum, so flag+env is the full set
    // of unvalidated sources that could reach resolveScoreModel.
    try {
      resolveScoreModel({
        ...(typeof args["score-model"] === "string" && args["score-model"]
          ? { flag: args["score-model"] as string }
          : {}),
        ...(process.env.LYSE_SCORE_MODEL !== undefined
          ? { env: process.env.LYSE_SCORE_MODEL }
          : {}),
      });
    } catch (err) {
      console.error(`[lyse] Error: ${(err as Error).message}`);
      process.exit(64); // EX_USAGE
    }

    const entitlement = await checkEntitlement("audit");
    if (!entitlement.allowed) {
      console.error(`Feature 'audit' not available on plan '${entitlement.plan}': ${entitlement.reason}`);
      process.exit(2);
    }

    // Resolve telemetry consent WITHOUT prompting — the first score must
    // render before any consent question (first-run DX). The interactive
    // prompt runs after the report, below. Per ADR 0012 the run that asks
    // never emits, which this ordering preserves by construction: an
    // undecided run resolves to accepted=false here.
    const consent = resolveConsentNonInteractive();
    const telemetryActive = consent.accepted && args["no-telemetry"] !== true;

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
      ...(args["render"] === true ? { render: true } : {}),
      ...(typeof args["storybook"] === "string" && args["storybook"]
        ? { storybook: args["storybook"] as string }
        : {}),
      // Precedence (flag > env > config > default) is resolved once inside
      // the pipeline via resolveScoreModel; here we just thread the raw flag
      // through. An invalid value surfaces as a thrown error from the pipeline.
      ...(typeof args["score-model"] === "string" && args["score-model"]
        ? { scoreModel: args["score-model"] as "v2" | "v3" }
        : {}),
      ...(args["staged"] === true
        ? { scope: "staged" as const }
        : args["scope"] === "changed" || args["scope"] === "staged" || args["scope"] === "uncommitted"
          ? { scope: args["scope"] as "changed" | "staged" | "uncommitted" }
          : {}),
      ...(typeof args["base"] === "string" && args["base"]
        ? { base: args["base"] as string }
        : {}),
    };

    // #115: resolve LLM consent once, in the CLI layer (mirrors telemetry).
    // --no-llm wins; --llm opts in for this run; otherwise env/persisted only —
    // the default audit path never prompts for the LLM filter (opt-in via
    // --llm or LYSE_LLM=1). The result gates the connector auto-detect path.
    const llmFlag =
      args["no-llm"] === true ? false : args["llm"] === true ? true : undefined;
    auditFlags.llmConsented = resolveLlmConsentNonInteractive(
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
      formatForSpinner === "json" || formatForSpinner === "sarif" || formatForSpinner === "html" || formatForSpinner === "tsv";

    let result: AuditResult, fileCount: number, hasTokenRegistry: boolean, config: LyseConfig, graph: DesignSystemGraph;
    try {
      ({ result, fileCount, hasTokenRegistry, config, graph } = await withSpinner<AuditOutcome>(
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
      if (err instanceof ScopeError) {
        console.error(`[lyse] ${err.message}`);
        process.exit(64);
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
    await ensureLyseGitignore(repoRoot);

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

    writeGraph(repoRoot, graph, { full: args["graph-full"] === true });

    if (args["scope"] === "new") {
      let baseline;
      try {
        baseline = readBaseline(join(repoRoot, ".lyse", "baseline.json"));
      } catch (e) {
        if (e instanceof BaselineError) {
          console.error(`[lyse] ${e.message}`);
          process.exit(64);
        }
        throw e;
      }
      const { newFindings, staleGraph } = selectNew(result.findings, baseline, graph);
      if (staleGraph) {
        console.error(
          "[lyse] baseline may be stale: the design-system graph changed since it was written. Re-run `lyse baseline write`.",
        );
      }
      const currentScores: Partial<Record<import("./types.js").AxisName, number>> = {};
      for (const a of result.axes) if (typeof a.score === "number") currentScores[a.axis] = a.score;
      const gate = evaluateGate({
        newFindings,
        currentScores,
        baseline,
        scoreContributingRuleIds: stableRuleIds(SUB_AXES, { filterRan: false }),
      });
      newScopeGateFail = gate.fail;
      newScopeGateReasons = gate.reasons;
      result.findings = newFindings;
    }

    const isTTY = process.stdout.isTTY ?? false;
    const format = args.format ?? (isTTY ? "text" : "json");

    // Resolve --limit for text/eslint/legacy output. JSON/SARIF intentionally
    // ignore the flag (machine consumers want the full report, always). When
    // the user doesn't pass --limit, the per-format default differs:
    //   text/legacy → undefined, so terminal.ts falls back to its historical
    //                 top-5 / verbose=all behavior;
    //   eslint      → null (unlimited) — eslint-style already lists findings
    //                 as a flat block; users see every finding by default and
    //                 pass --limit=N to truncate.
    let textFindingsLimit: number | null | undefined;
    try {
      textFindingsLimit = resolveLimit(args, format === "eslint" || format === "table" ? null : undefined);
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
    } else if (format === "tsv") {
      const tsvContent = renderTsv(result);
      if (args.output) {
        const outDir = resolve(args.output);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, "lyse.tsv"), tsvContent);
      } else {
        process.stdout.write(tsvContent);
      }
    } else {
      const jsonContent = renderJson(result, { includeTimestamp: !!args["include-timestamps"] });

      const isTextFormat = format === "text" || format === "eslint" || format === "legacy" || format === "table";

      const renderTextForStdout = async (): Promise<string> => {
        if (format === "eslint") {
          return renderEslintStyleAudit(result, textFindingsLimit) + "\n";
        }
        const opts = computeTerminalOpts(
          args, isTTY, fileCount, Date.now() - startTime, repoRoot, hasTokenRegistry, textFindingsLimit,
          config.advisory?.migrationScaleFileCount,
        );
        if (format === "table") {
          return renderTable(result, opts) + "\n";
        }
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
    const isMachineFormat = format === "json" || format === "sarif" || format === "tsv";
    const promptsAllowed =
      !args.quiet &&
      !isMachineFormat &&
      isInteractive() &&
      args["no-prompt"] !== true &&
      args.yes !== true;
    const wantsFeedback =
      args.interactive === true && promptsAllowed && result.findings.length > 0;

    // Email is captured only by the `lyse init` wizard. On audit we never
    // prompt; we only run `syncPendingEmail` (always, incl. non-TTY) to retry
    // delivery of an email the user already opted into during init but whose
    // earlier send failed (offline).
    await syncPendingEmail();

    if (promptsAllowed && !wantsFeedback) {
      // Standard action menu path (no --interactive, or no findings).
      const fsDetect = await detectFromFilesystem(repoRoot);
      const detectedIDE = !!(fsDetect.cursor.value || fsDetect.claudeCode.value);

      const choice = await showActionMenu({ findingsCount: result.findings.length, detectedIDE });

      if (choice === "handoff") {
        await runHandoffCommand(repoRoot);
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

    // Emit command_invoked metric (opt-in, only when consent has been accepted).
    // Per ADR 0012, suppress on the run that just requested consent.
    const didFail = typeof result.finalScore === "number" && result.finalScore < threshold;
    await appendCommandInvokedEvent(repoRoot, "audit", didFail ? "error" : "success", Date.now() - startTime, {
      suppress: consent.justAsked,
    });

    // First-run telemetry consent — the LAST interactive act of the run, after
    // the report, the action menu, and every telemetry emit. ADR 0012 (the run
    // that asks never emits) then holds by construction: accepting here flips
    // the consent cache only after all emit sites have already run gated off.
    if (promptsAllowed) {
      await ensureConsentDecision();
    }

    if (args["scope"] === "new") {
      if (newScopeGateFail) {
        for (const r of newScopeGateReasons) console.error(`[lyse] gate: ${r}`);
        process.exit(1);
      }
      // implicit exit 0
    } else if (didFail) {
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
      "WARNING: `lyse agents-md` is deprecated. Use `lyse agents` instead. (This alias will be removed in a future release.)\n"
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
    "score-model": { type: "string", description: "(with --score) scoring model: v3 (default) or v2 (legacy escape hatch)." },
    format: { type: "string", default: "text", description: "text | md (default: text)" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    if (args.score === true) {
      // Validate --score-model / LYSE_SCORE_MODEL at the boundary so a bad value
      // yields a clean [lyse] Error (exit 64), not a raw stack trace from
      // resolveScoreModel deep in the pipeline (mirrors the audit command).
      try {
        resolveScoreModel({
          ...(typeof args["score-model"] === "string" && args["score-model"]
            ? { flag: args["score-model"] as string }
            : {}),
          ...(process.env.LYSE_SCORE_MODEL !== undefined ? { env: process.env.LYSE_SCORE_MODEL } : {}),
        });
      } catch (err) {
        console.error(`[lyse] Error: ${(err as Error).message}`);
        process.exit(64); // EX_USAGE
      }
      // With --score the positional is a repo PATH (not a ruleId); default to cwd.
      const target =
        typeof args.ruleId === "string" && args.ruleId.length > 0 ? args.ruleId : process.cwd();
      await runExplainScore({
        cwd: target,
        ...(args["static-only"] === true ? { staticOnly: true } : {}),
        ...(typeof args["score-model"] === "string" && args["score-model"]
          ? { scoreModel: args["score-model"] as "v2" | "v3" }
          : {}),
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

// `lyse fix` is retired: Lyse no longer edits your code — it hands the findings
// to your coding agent. The old command name redirects to `lyse handoff` so
// existing muscle memory + scripts land in the right place.
const fixCommand = defineCommand({
  meta: { name: "fix", description: "Deprecated — Lyse now hands fixes to your coding agent (see `lyse handoff`)" },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    review: {
      type: "boolean",
      default: false,
      description: "See `lyse handoff --review`.",
    },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    if (args.review === true) process.env.LYSE_HANDOFF_REVIEW = "1";
    const cwd = resolve(args.path ?? ".");
    process.stderr.write(
      "[lyse] `lyse fix` is retired — Lyse hands fixes to your coding agent now.\n" +
        "       Running `lyse handoff`…\n\n",
    );
    await runHandoffCommand(cwd);
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

const baselineCommand = defineCommand({
  meta: { name: "baseline", description: "Manage the diff-first finding baseline (.lyse/baseline.json)" },
  subCommands: {
    write: defineCommand({
      meta: { name: "write", description: "Audit the repo and write .lyse/baseline.json (commit it to gate only NEW findings)" },
      args: {
        path: { type: "positional", required: false, default: ".", description: "repository root" },
        ...GLOBAL_FLAGS,
      },
      async run({ args }) {
        applyGlobalFlags(args);
        await runBaselineWrite({ root: resolve(String(args.path ?? ".")), quiet: args.quiet === true });
      },
    }),
  },
});

export const initCommand = defineCommand({
  meta: { name: "init", description: "Interactive wizard for first-time setup" },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    "first-run": { type: "boolean", description: "mark as first run (used by npm create lyse)" },
    scaffold: { type: "boolean", default: false, description: "generate missing AI-readiness files (llms.txt, AGENTS.md)" },
    "migrate-tokens": { type: "boolean", default: false, description: "migrate legacy ({ value, type }) token JSON to DTCG ({ $value, $type }); skips files that wouldn't be conformant" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const { resolve } = await import("node:path");
    // `runInit` is interactive top-to-bottom (intro → confirm → tasks), and
    // manages its own clack spinners. A long-lived CLI spinner here would keep
    // redrawing over the "Proceed?" prompt and bury it forever (#205), so call
    // runInit directly.
    await runInit({
      cwd: resolve(args.path ?? "."),
      yes: Boolean(args.yes),
      scaffold: args.scaffold,
      migrateTokens: args["migrate-tokens"],
    });
  },
});

const addCommand = defineCommand({
  meta: { name: "add", description: "Add a Lyse feature to your repo (CI gate, etc.)" },
  subCommands: {
    "ci-gate": defineCommand({
      meta: {
        name: "ci-gate",
        description: "Install the Lyse diff-first CI gate (.github/workflows/lyse.yml — runs `lyse audit --scope new`)",
      },
      args: {
        path: { type: "positional", required: false, default: ".", description: "repository root" },
        threshold: { type: "string", description: "no-op in the diff-first gate (kept for back-compat)" },
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
                "\nNext: run `lyse baseline write`, commit .lyse/baseline.json + the workflow, then open a PR.\n",
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
    "git-hook": defineCommand({
      meta: {
        name: "git-hook",
        description: "Install a pre-commit hook that surfaces design-system drift in staged files (advisory; runs `lyse audit --staged`)",
      },
      args: {
        path: { type: "positional", required: false, default: ".", description: "repository root" },
        "lyse-version": { type: "string", description: "Lyse CLI version the hook should pin (default: the running CLI version)" },
        force: { type: "boolean", default: false, description: "replace a pre-existing pre-commit hook" },
        ...GLOBAL_FLAGS,
      },
      async run({ args }) {
        applyGlobalFlags(args);
        const cwd = resolve(String(args.path ?? "."));
        try {
          const opts: Parameters<typeof runAddGitHook>[0] = { cwd };
          if (typeof args["lyse-version"] === "string") opts.lyseVersion = args["lyse-version"];
          if (args.force === true) opts.force = true;
          const result = await runAddGitHook(opts);
          if (args.quiet !== true) {
            for (const p of result.written) process.stdout.write(`Wrote ${p}\n`);
            for (const s of result.skipped) process.stdout.write(`Skipped ${s.path} — ${s.reason}\n`);
            if (result.written.length > 0) {
              process.stdout.write(
                "\nNext: stage some changes and commit — Lyse will surface drift in the staged files. Bypass with `git commit --no-verify`.\n",
              );
            }
          }
        } catch (e) {
          if (e instanceof AddGitHookError) {
            process.stderr.write(`lyse add git-hook: ${e.message}\n`);
            process.exit(2);
          }
          throw e;
        }
      },
    }),
  },
});

const installCommand = defineCommand({
  meta: {
    name: "install",
    description: "Set up Lyse in this repo: install the agent skill (for detected coding agents) + an advisory pre-commit hook",
  },
  args: {
    path: { type: "positional", required: false, default: ".", description: "repository root" },
    "lyse-version": { type: "string", description: "Lyse CLI version the hook should pin (default: the running CLI version)" },
    force: { type: "boolean", default: false, description: "replace a pre-existing pre-commit hook" },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    const cwd = resolve(String(args.path ?? "."));
    const opts: Parameters<typeof runInstall>[0] = { cwd };
    if (typeof args["lyse-version"] === "string") opts.lyseVersion = args["lyse-version"];
    if (args.force === true) opts.force = true;
    const r = await runInstall(opts);
    if (args.quiet !== true) {
      for (const s of r.skills) {
        process.stdout.write(`${s.installed ? "Installed" : "Failed"} skill → ${s.path} (${s.agent})\n`);
      }
      if (r.skills.length === 0) {
        process.stdout.write("No coding agent detected — run `lyse handoff` after an audit to install the skill on demand.\n");
      }
      for (const p of r.hook.written) process.stdout.write(`Wrote ${p}\n`);
      for (const sk of r.hook.skipped) process.stdout.write(`Skipped ${sk.path} — ${sk.reason}\n`);
      process.stdout.write(
        "\nNext: run `lyse audit` to see your design-system health, then `lyse handoff` to have your agent fix the issues.\n",
      );
    }
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

const handoffCommand = defineCommand({
  meta: { name: "handoff", description: "Audit then hand findings to your coding agent (Claude Code, Cursor, Codex)" },
  args: {
    directory: { type: "positional", required: false, default: ".", description: "repository root (defaults to current working directory)" },
    review: {
      type: "boolean",
      default: false,
      description:
        "Launch the agent under its own default permissions (it prompts you per-action) instead of bypassing its permission prompts. Also settable via LYSE_HANDOFF_REVIEW=1 or .lyse.yaml `handoff.review`.",
    },
    ...GLOBAL_FLAGS,
  },
  async run({ args }) {
    applyGlobalFlags(args);
    if (args.review === true) process.env.LYSE_HANDOFF_REVIEW = "1";
    const dir = resolve(typeof args.directory === "string" ? args.directory : ".");
    await runHandoffCommand(dir);
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

const main = defineCommand({
  meta: { name: "lyse", version: VERSION, description: "Audit your design system" },
  args: {
    yes: { type: "boolean", description: "Accept all defaults (no prompts)" },
    "no-prompt": { type: "boolean", description: "Refuse prompts; error on missing input" },
    "no-color": { type: "boolean", description: "Disable ANSI color output" },
    quiet: { type: "boolean", description: "Suppress informational output" },
  },
  subCommands: { init: initCommand, audit: auditCommand, fix: fixCommand, add: addCommand, install: installCommand, share: shareCommand, badge: badgeCommand, baseline: baselineCommand, agents: agentsCommand, "agents-md": agentsMdCommand, handoff: handoffCommand, "bench-pack": benchPackCommand, version: versionCommand, explain: explainCommand, mcp: mcpCommand, feedback: feedbackCommand, telemetry: telemetryCommand },
  async run({ args, cmd, rawArgs }) {
    applyGlobalFlags(args);

    // citty calls parent.run() AFTER the matched subcommand finishes — so
    // detect when a subcommand was invoked (first non-flag in rawArgs) and
    // bow out cleanly. Otherwise our help / bare-audit delegation would print
    // AFTER the subcommand's stdout (breaking audit's JSON / SARIF / mcp-serve
    // output).
    const subCommands = cmd.subCommands as Record<string, unknown> | undefined;
    if (subCommands) {
      const firstPositional = rawArgs.find((a) => !a.startsWith("-"));
      if (firstPositional && firstPositional in subCommands) return;
    }

    // Decide on the raw terminal signal, not isInteractive(): that helper
    // conflates "user wants no questions" (LYSE_YES/LYSE_NO_PROMPT/CI) with
    // "no terminal", and applyGlobalFlags() above has already set those env
    // vars from --yes/--no-prompt. Gating on isInteractive() here would make
    // `lyse --yes` on a real TTY fall through to usage instead of auditing —
    // the flags mean "don't ask questions", not "there is no terminal". Only
    // a genuinely missing TTY should print usage.
    if (process.stdout.isTTY !== true) {
      // Use renderUsage + process.stdout.write rather than citty's showUsage
      // because the latter routes through consola, which silently drops output
      // when CI=true is set in the env (regression-proofs CI/test environments).
      process.stdout.write((await renderUsage(cmd)) + "\n");
      return;
    }

    // Bare `lyse` on a TTY runs the audit of the current directory, exactly
    // as `lyse audit` (react-doctor trajectory: the first command IS the
    // product). The standalone REPL menu is retired — the post-audit action
    // menu (shown by auditCommand itself) owns interactive follow-ups.
    const forwarded: string[] = [];
    if (args.yes === true) forwarded.push("--yes");
    if (args["no-prompt"] === true) forwarded.push("--no-prompt");
    if (args.quiet === true) forwarded.push("--quiet");
    if (args["no-color"] === true) forwarded.push("--no-color");
    await runCommand(auditCommand, { rawArgs: forwarded });
  },
});

runMain(main);
