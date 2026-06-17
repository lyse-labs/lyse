/**
 * Shared audit pipeline — extracted so both the CLI and the fix orchestrator
 * can run a full audit without going through the CLI entry point.
 *
 * Returns AuditResult plus auxiliary data (tokens, config) needed by the fix
 * orchestrator to build a ClassifyContext.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { loadConfig, resolveConfigPath } from "../config/schema.js";
import { findUnknownRuleIds, disabledRuleIds } from "../config/rules-config.js";
import { hashDeps } from "../util/hash-deps.js";
import { detectFromPackageJson } from "../detection/from-package-json.js";
import { walk, DEFAULT_EXCLUDE_PATHS } from "../walker.js";
import { parseTs } from "../parsers/ts.js";
import { parseCss } from "../parsers/css.js";
import { extractCssInJs } from "../parsers/css-in-js.js";
import { extractSfcStyleBlocks } from "../parsers/sfc-styles.js";
import { loadTokens } from "../loaders/tokens.js";
import { loadStories } from "../loaders/stories.js";
import { buildComponentInventory } from "../loaders/components.js";
import { ruleObjects } from "../rules/registry.js";
import { loadGeneratedPack } from "../rules/pack-loader.js";
import { runRules } from "../rule-runner.js";
import { scoreFromFindings } from "../scorer.js";
import { computeGrade } from "../reliability/grade.js";
import { VERSION } from "../index.js";
import { RULES_VERSION } from "../rules/manifest.js";
import { runLayer4Stage } from "../llm/layer4-stage.js";
import { runFilterStage } from "../llm/filter-stage.js";
import { isSuppressed } from "../suppression/inline.js";
import { loadLyseIgnore } from "../suppression/lyseignore.js";
import type {
  AuditResult,
  Finding,
  Layer4Meta,
  RuleContext,
  ParsedFiles,
  LyseConfig,
  TokenMap,
  ComponentInventoryEntry,
} from "../types.js";

// Import for local use within this module (function signatures).
import { RefuseToRunError, type AuditFlags } from "./audit-flags.js";
// Re-export AuditFlags + RefuseToRunError for backward compatibility.
// External callers (cli.ts, fix.ts, tests) import these from audit-pipeline.
export { RefuseToRunError, type AuditFlags };

export interface AuditPipelineResult {
  /** Full AuditResult as produced by the audit subcommand. */
  result: AuditResult;
  /** Loaded token map (null when no token source was found). */
  tokens: TokenMap | null;
  /** Parsed .lyse.yaml config. */
  config: LyseConfig;
  /** Component inventory for the configured DS module. */
  componentInventory: ComponentInventoryEntry[];
  /** Number of source files scanned. */
  fileCount: number;
}

function maybePrintRefreshHint(repoRoot: string): void {
  const metaPath = join(repoRoot, ".lyse", "init-meta.json");
  if (!existsSync(metaPath)) return;
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
      generated_at_ms: number;
      deps_hash: string;
      selected_deps: string[];
    };
    const daysSince = (Date.now() - meta.generated_at_ms) / 86_400_000;
    const currentHash = hashDeps(repoRoot, meta.selected_deps);
    const depsChanged = currentHash !== meta.deps_hash;
    if (depsChanged) {
      process.stderr.write(
        `[hint] Major dependency change detected since last init. Run 'lyse init --refresh' to update your rule pack.\n`,
      );
    } else if (daysSince > 90) {
      process.stderr.write(
        `[hint] Your rule pack was generated ${Math.floor(daysSince)} days ago. Consider 'lyse init --refresh' to regenerate it.\n`,
      );
    }
  } catch {
    /* ignore malformed meta */
  }
}

interface PackageJsonLite {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

function readPackageJson(path: string): PackageJsonLite | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJsonLite;
  } catch {
    return null;
  }
}

function collectAllDeps(pkg: PackageJsonLite): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function readWorkspaceGlobs(repoRoot: string, rootPkg: PackageJsonLite): string[] {
  if (rootPkg.workspaces) {
    if (Array.isArray(rootPkg.workspaces)) return rootPkg.workspaces;
    if (rootPkg.workspaces.packages) return rootPkg.workspaces.packages;
  }
  try {
    const raw = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
    const parsed = parseYaml(raw) as { packages?: string[] } | null;
    if (parsed?.packages && Array.isArray(parsed.packages)) return parsed.packages;
  } catch {
    // no pnpm-workspace.yaml — fine
  }
  return [];
}

// Workspace globs like "apps/*" — we only resolve the first wildcard level
// (no recursive ** support) which is enough for the stack-detection signal we
// need without pulling fast-glob into the audit hot path.
function resolveWorkspaceGlob(repoRoot: string, glob: string): string[] {
  const segments = glob.split("/");
  let candidates = [repoRoot];
  for (const seg of segments) {
    const next: string[] = [];
    for (const base of candidates) {
      if (seg === "*") {
        try {
          for (const child of readdirSync(base)) {
            const full = join(base, child);
            try {
              if (statSync(full).isDirectory() && child !== "node_modules") next.push(full);
            } catch {
              // skip unreadable entries
            }
          }
        } catch {
          // skip unreadable directories
        }
      } else {
        next.push(join(base, seg));
      }
    }
    candidates = next;
  }
  return candidates;
}

function detectStack(repoRoot: string): string[] {
  const rootPkg = readPackageJson(join(repoRoot, "package.json"));
  if (!rootPkg) return [];

  const aggregate: Record<string, string> = collectAllDeps(rootPkg);
  // Monorepo support: if the root package.json declares workspaces, merge sub-
  // package deps so stack detection works for cal.com-style repos where react/
  // tailwind/storybook live in `apps/web/package.json` not the root.
  const globs = readWorkspaceGlobs(repoRoot, rootPkg);
  if (globs.length > 0) {
    const seen = new Set<string>();
    for (const glob of globs) {
      for (const dir of resolveWorkspaceGlob(repoRoot, glob)) {
        if (seen.has(dir)) continue;
        seen.add(dir);
        const subPkg = readPackageJson(join(dir, "package.json"));
        if (!subPkg) continue;
        Object.assign(aggregate, collectAllDeps(subPkg));
      }
    }
  }

  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(aggregate, k);
  const stack: string[] = [];
  if (has("react")) stack.push("react");
  if (has("tailwindcss")) stack.push("tailwind");
  if (has("@storybook/react") || has("storybook")) stack.push("storybook");
  if (has("styled-components")) stack.push("styled-components");
  return stack;
}

/**
 * Run a full audit on a repository root.
 * This is the same pipeline as the `lyse audit` CLI command, extracted for
 * programmatic use by the fix orchestrator and future commands.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @param flags    - Optional CLI-level overrides (e.g. --static-only).
 */
export async function auditDirectory(repoRoot: string, flags?: AuditFlags): Promise<AuditPipelineResult> {
  const absoluteRoot = resolve(repoRoot);
  const t0 = Date.now();
  const config = loadConfig(absoluteRoot);

  // Resolve componentsModule: prefer explicit config, fall back to auto-detection
  // so DS monorepos (workspace-walk branch) get scored without needing lyse init.
  let componentsModule = config.designSystem?.componentsModule ?? null;
  let dsSelfMode = false;
  if (!componentsModule) {
    const detected = await detectFromPackageJson(absoluteRoot);
    componentsModule = detected.componentsModule.value ?? null;
    // When detection source is "workspace DS export", the repo IS the DS itself.
    // Rules like no-native-shadows and stories/coverage have consumer-of-DS semantics
    // and must skip — v0.2 will add DS-self-aware rule variants.
    if (detected.componentsModule.source.startsWith("workspace DS export")) {
      dsSelfMode = true;
    }
  }

  const userExcludePaths = config.designSystem?.excludePaths ?? [];
  // `.lyseignore` patterns (loaded once at repo root) — same gitignore-style
  // syntax as user `excludePaths`. Threaded to the walker and respected at
  // the file-walk layer (no work done on these files at all).
  const lyseIgnorePatterns = loadLyseIgnore(absoluteRoot);

  // Combine DEFAULT_EXCLUDE_PATHS with user-provided excludePaths.
  // User paths EXTEND the defaults (they never replace them).
  // The walker already applies DEFAULT_EXCLUDE_PATHS internally; extraIgnores
  // carries the user's additions so they are also respected at the walker layer.
  const excludePaths = [...DEFAULT_EXCLUDE_PATHS, ...userExcludePaths, ...lyseIgnorePatterns];
  flags?.progress?.update("Discovering files…");
  const files = await walk(absoluteRoot, { extraIgnores: [...userExcludePaths, ...lyseIgnorePatterns] });
  flags?.progress?.update(`Parsing source (${files.length} files)…`);
  const parsed: ParsedFiles = { ts: [], css: [], cssInJs: [] };
  // Keep the raw source per relative file path so we can apply inline
  // suppression directives (`// lyse-disable-next-line <ruleId>`) AFTER
  // runRules emits findings. Without this map, the directives — promised in
  // docs/guide/configuration.md — would silently no-op.
  const fileContents = new Map<string, string>();
  let parseErrorCount = 0;

  type FileResult =
    | { kind: "ts"; ts: Awaited<ReturnType<typeof parseTs>>; cssInJs: ReturnType<typeof extractCssInJs>; rel: string; source: string }
    | { kind: "css"; css: Awaited<ReturnType<typeof parseCss>>; path: string; rel: string; source: string }
    | null;

  const fileResults = await Promise.all(
    files.map(async (path): Promise<FileResult> => {
      const source = readFileSync(path, "utf8");
      const rel = path.startsWith(absoluteRoot + "/") ? path.slice(absoluteRoot.length + 1) : path;
      if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) {
        const ts = await parseTs(rel, source);
        const cssInJs = ts.ast !== null ? extractCssInJs(rel, source) : [];
        return { kind: "ts", ts, cssInJs, rel, source };
      }
      if (/\.(s?css)$/.test(path)) {
        const css = await parseCss(rel, source);
        return { kind: "css", css, path, rel, source };
      }
      // Svelte/Vue single-file components embed CSS in <style> blocks — extract
      // them so token-drift rules cover non-React design systems (#102).
      if (/\.(svelte|vue)$/.test(path)) {
        const styles = extractSfcStyleBlocks(source).join("\n\n");
        if (styles) {
          const css = await parseCss(rel, styles);
          return { kind: "css", css, path, rel, source };
        }
        return null;
      }
      return null;
    }),
  );

  for (const r of fileResults) {
    if (r) fileContents.set(r.rel, r.source);
  }

  for (const r of fileResults) {
    if (r?.kind === "ts") {
      parsed.ts.push(r.ts);
      if (r.ts.ast === null) parseErrorCount++;
      else parsed.cssInJs.push(...r.cssInJs);
    } else if (r?.kind === "css") {
      if (r.css.skipped) {
        // The walker only globs `.css` / `.scss` and the SCSS transform either
        // succeeds or falls back to `skipped: true` — both reach this branch
        // as a generic parse error.
        parseErrorCount++;
      } else {
        parsed.css.push(r.css);
      }
    }
  }
  if (parseErrorCount > 0) {
    process.stderr.write(
      `[lyse] Warning: skipped ${parseErrorCount} file${parseErrorCount !== 1 ? "s" : ""} due to parse errors ` +
        `(malformed source — file is excluded from audit results)\n`,
    );
  }

  flags?.progress?.update("Loading tokens + components + stories…");
  const tokens = await loadTokens(absoluteRoot);
  const storyIndex = await loadStories(absoluteRoot);
  const componentInventory = componentsModule
    ? buildComponentInventory(componentsModule, parsed.ts)
    : [];

  const ctx: RuleContext = {
    repoRoot: absoluteRoot,
    tokens,
    componentsModule,
    componentInventory,
    storyIndex,
    excludePaths,
    dsSelfMode,
  };

  const generated = loadGeneratedPack(absoluteRoot);
  for (const w of generated.warnings) process.stderr.write(`[lyse] ${w}\n`);
  const allRules = [...ruleObjects, ...generated.rules];

  // Validate + apply the `rules:` config block against the actual registry
  // (built-ins + generated). An unknown rule id is a hard error here — a typo'd
  // or renamed id must never silently no-op. Disabled rules are dropped before
  // running so they contribute no findings and no opportunities.
  const unknownRuleIds = findUnknownRuleIds(config, new Set(allRules.map((r) => r.id)));
  if (unknownRuleIds.length > 0) {
    throw new Error(
      `Unknown rule id(s) in .lyse.yaml \`rules:\`: ${unknownRuleIds.join(", ")}. ` +
        `Run \`lyse rules\` to list valid rule ids.`,
    );
  }
  const disabled = disabledRuleIds(config);
  const activeRules = disabled.size > 0 ? allRules.filter((r) => !disabled.has(r.id)) : allRules;

  flags?.progress?.update(`Running ${activeRules.length} rules…`);
  const runResult = await runRules(activeRules, ctx, parsed);

  // Apply inline suppression directives — `// lyse-disable-next-line <ruleId>`
  // and `/* lyse-disable <ruleId> */` — to drop findings the user has
  // explicitly approved. Filter happens AFTER the rule engine so rules don't
  // need to be suppression-aware. Per `packages/core/src/suppression/inline.ts`.
  const suppressedFindings: Finding[] = [];
  runResult.findings = runResult.findings.filter((f) => {
    const source = fileContents.get(f.location.file);
    if (!source) return true;
    if (isSuppressed(source, f.ruleId, f.location.line)) {
      suppressedFindings.push(f);
      return false;
    }
    return true;
  });
  // Re-tally findingsByAxis after suppression to keep score math accurate.
  for (const axis of Object.keys(runResult.findingsByAxis) as (keyof typeof runResult.findingsByAxis)[]) {
    runResult.findingsByAxis[axis] = runResult.findings.filter((f) => f.axis === axis).length;
  }

  // Layer-4 LLM precision filter — drops semantic FPs on color/spacing findings.
  // Default-ON when a connector resolves (e.g. agent-cli auto-selected); degrades
  // to a pure pass-through (Noop connector → empty text → bail) so the static
  // floor is preserved byte-for-byte. See #115 / filter-stage.ts.
  const filter = await runFilterStage({
    repoRoot: absoluteRoot,
    config,
    flags,
    findings: runResult.findings,
    fileContents,
  });
  if (filter.meta.filteredCount > 0) {
    runResult.findings = filter.findings;
    for (const axis of Object.keys(runResult.findingsByAxis) as (keyof typeof runResult.findingsByAxis)[]) {
      runResult.findingsByAxis[axis] = runResult.findings.filter((f) => f.axis === axis).length;
    }
  }

  // -----------------------------------------------------------------------
  // Layer 4: LLM augmentation (ADR-0015) — delegated to llm/layer4-stage.ts.
  // -----------------------------------------------------------------------
  const layer4 = await runLayer4Stage({
    repoRoot: absoluteRoot,
    config,
    flags,
    staticFindings: runResult.findings,
  });

  // Merge augmented findings into static findings BEFORE scoring so the
  // final score reflects both Layers 1+2 and Layer 4.
  if (layer4.augmentedFindings.length > 0) {
    runResult.findings.push(...layer4.augmentedFindings);
    // Keep findingsByAxis counts in sync so score() reflects the new findings.
    for (const f of layer4.augmentedFindings) {
      const ax = f.axis as keyof typeof runResult.findingsByAxis;
      if (ax in runResult.findingsByAxis) {
        runResult.findingsByAxis[ax]++;
      }
    }
    // Re-sort by severity (error < warn < info)
    const severityOrder: Record<string, number> = { error: 0, warn: 1, info: 2 };
    runResult.findings.sort(
      (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9),
    );
  }
  const layer4Meta: Layer4Meta = {
    ...layer4.meta,
    ...(filter.meta.filterRan
      ? { filterRan: true, filteredCount: filter.meta.filteredCount }
      : {}),
  };
  // -----------------------------------------------------------------------

  // Phase 4.1 — v2 scorer: severity-weighted rate + log-scaled absolute cap.
  // We pass the flat findings list (post-suppression, post-Layer-4) directly;
  // the adapter aggregates into per-axis severity buckets internally.
  flags?.progress?.update("Scoring…");
  const scoring = scoreFromFindings(runResult.findings, runResult.opportunitiesByAxis);
  const grade = computeGrade(scoring.finalScore, scoring.axes);

  const result: AuditResult = {
    schemaVersion: 2,
    rulesVersion: RULES_VERSION,
    toolVersion: VERSION,
    // "scoring-v1" = pinned axis-weighted formula in `scorer.ts` (the v0.1.0
    // active path). The sub-axis-aware variant (`computeScoreV1` in
    // `reliability/score/formula-v1.ts`) is read-only at v0.1.0 — powers
    // `lyse explain --score` and goes live as the actual scorer once gold-set
    // promotion of sub-axes to `stable` lands (v0.2+). Same semver bump.
    scoringVersion: "scoring-v1",
    repoRoot: absoluteRoot,
    timestamp: new Date().toISOString(),
    stack: detectStack(absoluteRoot),
    finalScore: scoring.finalScore,
    tier: scoring.tier,
    grade,
    axes: scoring.axes,
    findings: runResult.findings,
    ...(suppressedFindings.length > 0 ? { suppressedFindings } : {}),
    meta: {
      ...(layer4Meta ? { layer4: layer4Meta } : {}),
      coverage: {
        scannedFiles: files.length,
        durationMs: Date.now() - t0,
        configPath: resolveConfigPath(absoluteRoot),
        ...(runResult.parseErrors.length > 0 ? { parseErrors: runResult.parseErrors } : {}),
      },
    },
  };

  maybePrintRefreshHint(absoluteRoot);
  return { result, tokens, config, componentInventory, fileCount: files.length };
}
