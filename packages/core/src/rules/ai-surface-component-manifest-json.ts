import { readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "ai-surface/component-manifest-json";
const MAX_FILE_BYTES = 2_000_000;

const CANDIDATE_PATTERNS = [
  "components.json",
  "lyse.components.json",
  "apps/*/components.json",
  "apps/*/lyse.components.json",
  "packages/*/components.json",
  "packages/*/lyse.components.json",
];

interface ManifestEntry {
  name?: unknown;
  sourceFile?: unknown;
  import?: unknown;
  description?: unknown;
  props?: unknown;
  tags?: unknown;
  [key: string]: unknown;
}

interface ManifestShape {
  components?: unknown;
  [key: string]: unknown;
}

function discoverManifests(ctx: RuleContext): string[] {
  if (!ctx.repoRoot) return [];
  let entries: string[] = [];
  try {
    entries = fg.sync(CANDIDATE_PATTERNS, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const rel of entries) {
    if (isPathExcluded(rel, ctx.excludePaths)) continue;
    out.add(rel);
  }
  return Array.from(out).sort();
}

function readJsonIfSmall(absPath: string): { data: unknown | null; parseError: string | null } {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return { data: null, parseError: null };
    if (stat.size > MAX_FILE_BYTES) return { data: null, parseError: "file too large" };
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return { data: null, parseError: "empty file" };
    return { data: JSON.parse(raw), parseError: null };
  } catch (e) {
    return { data: null, parseError: e instanceof Error ? e.message : "unknown parse error" };
  }
}

interface ValidationOutcome {
  warnings: string[];
  hasValidComponents: boolean;
}

function isShadcnComponentsJson(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  // shadcn/ui components.json has $schema or aliases, not a `components` list
  if (typeof obj.$schema === "string" && obj.$schema.includes("shadcn")) return true;
  if (typeof obj.aliases === "object" && obj.aliases !== null && !("components" in obj)) return true;
  return false;
}

function validateEntry(entry: unknown): { ok: boolean; reason?: string } {
  if (typeof entry === "string") {
    return entry.trim().length > 0 ? { ok: true } : { ok: false, reason: "empty string entry" };
  }
  if (typeof entry !== "object" || entry === null) {
    return { ok: false, reason: "entry is not an object" };
  }
  const e = entry as ManifestEntry;
  if (typeof e.name !== "string" || e.name.trim().length === 0) {
    return { ok: false, reason: "entry missing `name`" };
  }
  const hasSource =
    (typeof e.sourceFile === "string" && e.sourceFile.trim().length > 0) ||
    (typeof e.import === "string" && e.import.trim().length > 0);
  if (!hasSource) {
    return { ok: false, reason: `entry "${e.name}" missing \`sourceFile\` or \`import\`` };
  }
  return { ok: true };
}

function validateManifest(data: unknown): ValidationOutcome {
  const warnings: string[] = [];
  if (typeof data !== "object" || data === null) {
    return { warnings: ["manifest root is not a JSON object"], hasValidComponents: false };
  }
  const shape = data as ManifestShape;
  if (!("components" in shape)) {
    return { warnings: ["manifest has no `components` array or object"], hasValidComponents: false };
  }
  const components = shape.components;
  if (Array.isArray(components)) {
    if (components.length === 0) {
      warnings.push("`components` array is empty");
      return { warnings, hasValidComponents: false };
    }
    for (let i = 0; i < components.length; i++) {
      const result = validateEntry(components[i]);
      if (!result.ok) warnings.push(`components[${i}]: ${result.reason ?? "invalid entry"}`);
    }
    return { warnings, hasValidComponents: warnings.length === 0 };
  }
  if (typeof components === "object" && components !== null) {
    const entries = Object.entries(components as Record<string, unknown>);
    if (entries.length === 0) {
      warnings.push("`components` object is empty");
      return { warnings, hasValidComponents: false };
    }
    for (const [name, entry] of entries) {
      if (typeof entry === "object" && entry !== null) {
        const e = entry as ManifestEntry;
        const hasSource =
          (typeof e.sourceFile === "string" && e.sourceFile.trim().length > 0) ||
          (typeof e.import === "string" && e.import.trim().length > 0);
        if (!hasSource) warnings.push(`components.${name} missing \`sourceFile\` or \`import\``);
      } else if (typeof entry !== "string" || entry.trim().length === 0) {
        warnings.push(`components.${name} has invalid value`);
      }
    }
    return { warnings, hasValidComponents: warnings.length === 0 };
  }
  return { warnings: ["`components` must be an array or object"], hasValidComponents: false };
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) {
    return { findings, opportunities: 0 };
  }

  const relFiles = discoverManifests(ctx);

  // Filter out shadcn-style components.json (config file, not a manifest).
  const lyseStyle: string[] = [];
  let shadcnDetected = false;
  for (const rel of relFiles) {
    const abs = join(ctx.repoRoot, rel);
    const { data } = readJsonIfSmall(abs);
    if (data !== null && isShadcnComponentsJson(data)) {
      shadcnDetected = true;
      continue;
    }
    lyseStyle.push(rel);
  }

  if (lyseStyle.length === 0) {
    const suggestion = shadcnDetected
      ? "found a shadcn/ui components.json but no lyse-style component manifest; add `lyse.components.json` listing { name, sourceFile } entries for MCP cost reduction"
      : "create a `components.json` or `lyse.components.json` listing your components ({ name, sourceFile }) so MCP servers can serve component lookups at ~5× lower cost than reading source files";
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "info",
      location: { file: "components.json", line: 1, column: 1 },
      message: "No component manifest JSON found — MCP tools fall back to source-file reads",
      suggestion,
    });
    return { findings, opportunities: 1 };
  }

  let opportunities = 0;
  for (const rel of lyseStyle) {
    opportunities += 1;
    const abs = join(ctx.repoRoot, rel);
    const { data, parseError } = readJsonIfSmall(abs);
    const relPath = relative(ctx.repoRoot, abs) || rel;
    if (data === null) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: `Component manifest is not valid JSON${parseError ? ` (${parseError})` : ""}`,
        suggestion: "ensure the manifest is parseable JSON",
      });
      continue;
    }
    const outcome = validateManifest(data);
    for (const warn of outcome.warnings) {
      findings.push({
        ruleId: RULE_ID,
        axis: "ai-surface",
        severity: "warning",
        location: { file: relPath, line: 1, column: 1 },
        message: warn,
        suggestion:
          "each entry should be { name: string, sourceFile: string } (or { name, import } for shadcn-style)",
      });
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "info",
    shortDescription: "Component manifest JSON for MCP cost reduction",
    fullDescription:
      "Looks for a component manifest at the repo root (`components.json`, `lyse.components.json`) or in a monorepo (`apps/*/components.json`, `packages/*/components.json`). When found, validates the file is parseable JSON, has a top-level `components` array or object, and each entry has `{ name, sourceFile }` or `{ name, import }`. Absence emits an info finding; malformed manifests emit warnings. shadcn/ui-style `components.json` (the CLI config file, not a manifest) is detected and not counted as a lyse manifest.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-component-manifest-json.md",
    rationale: `Why it matters

The Indeed MCP cost study (Stream 1) and the broader manifest-pattern literature (Stream 2) show that a static component manifest reduces MCP tool cost by ~5× compared to reading the underlying source files at lookup time. Agents calling \`lyse_components\` or equivalent get a deterministic, low-token list of components instead of paging through tsx files.

The manifest is also the source of truth for component discovery in code-connect and MCP-driven design-to-code workflows — without it, tools must heuristically scan exports or rely on conventions that break across monorepos.

Severity is intentionally informational for absence (the absence is a missed optimisation, not a bug). Malformed manifests are warnings because they will silently break consumers.`,
    examples: [
      {
        good: '{ "components": [ { "name": "Button", "sourceFile": "packages/ui/src/button.tsx" } ] }',
        bad: '{ "stuff": [] }',
      },
      {
        good: '{ "components": { "Button": { "import": "@acme/ui" } } }',
        bad: '{ "components": [ { "sourceFile": "x.tsx" } ] }',
      },
    ],
    allowlist: [
      "shadcn/ui `components.json` (the CLI config file) — detected via `$schema` or `aliases` and skipped",
      "files larger than 2 MB — skipped to avoid pathological cases",
      "files matching `ctx.excludePaths` config",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  validateManifest,
  validateEntry,
  isShadcnComponentsJson,
  CANDIDATE_PATTERNS,
};
