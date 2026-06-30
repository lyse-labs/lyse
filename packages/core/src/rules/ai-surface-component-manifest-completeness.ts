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
import { _internal as manifestJsonInternal } from "./ai-surface-component-manifest-json.js";

const RULE_ID = "ai-surface/component-manifest-completeness";
const MAX_FILE_BYTES = 2_000_000;

const CANDIDATE_PATTERNS = manifestJsonInternal.CANDIDATE_PATTERNS;

interface ComponentEntry {
  name?: unknown;
  props?: unknown;
  variants?: unknown;
  examples?: unknown;
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

function readJsonIfSmall(absPath: string): { data: unknown | null } {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return { data: null };
    if (stat.size > MAX_FILE_BYTES) return { data: null };
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return { data: null };
    return { data: JSON.parse(raw) };
  } catch {
    return { data: null };
  }
}

function checkEntryCompleteness(entry: ComponentEntry, relPath: string, findings: Finding[]): void {
  const name = typeof entry.name === "string" && entry.name.trim().length > 0 ? entry.name : null;
  if (!name) return; // manifest-json owns the "name required" signal

  const label = `Component "${name}"`;
  const loc = { file: relPath, line: 1, column: 1 };

  const props = entry.props;
  if (props === undefined || props === null || (Array.isArray(props) && props.length === 0)) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "info",
      location: loc,
      message: `${label} manifest entry is missing documented \`props\``,
      suggestion: "add a `props` array (e.g. [{ name: \"variant\", type: \"string\" }]) so MCP tools can surface prop docs without reading source files",
    });
  }

  const variants = entry.variants;
  if (variants !== undefined && Array.isArray(variants) && variants.length === 0) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "info",
      location: loc,
      message: `${label} manifest entry has an empty \`variants\` array`,
      suggestion: "populate `variants` with the named variants (e.g. [\"primary\", \"secondary\"]) or remove the empty array",
    });
  }

  const examples = entry.examples;
  if (examples === undefined || examples === null || (Array.isArray(examples) && examples.length === 0)) {
    findings.push({
      ruleId: RULE_ID,
      axis: "ai-surface",
      severity: "info",
      location: loc,
      message: `${label} manifest entry is missing \`examples\``,
      suggestion: "add an `examples` array (e.g. [\"<Button variant=\\\"primary\\\">Save</Button>\"]) so agents can generate correct usage without reading stories",
    });
  }
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

  // Filter out shadcn-style components.json — same guard as manifest-json rule.
  const lyseStyle: string[] = [];
  for (const rel of relFiles) {
    const abs = join(ctx.repoRoot, rel);
    const { data } = readJsonIfSmall(abs);
    if (data !== null && manifestJsonInternal.isShadcnComponentsJson(data)) continue;
    lyseStyle.push(rel);
  }

  // Silent when no lyse-style manifest exists — manifest-json owns the absence signal.
  if (lyseStyle.length === 0) {
    return { findings, opportunities: 0 };
  }

  let opportunities = 0;
  for (const rel of lyseStyle) {
    const abs = join(ctx.repoRoot, rel);
    const { data } = readJsonIfSmall(abs);
    if (data === null) continue; // not our concern — manifest-json handles parse errors
    const relPath = relative(ctx.repoRoot, abs) || rel;

    if (typeof data !== "object" || data === null) continue;
    const shape = data as Record<string, unknown>;
    const components = shape["components"];
    if (!Array.isArray(components) || components.length === 0) continue;

    opportunities += components.length;
    for (const entry of components) {
      if (typeof entry !== "object" || entry === null) continue;
      checkEntryCompleteness(entry as ComponentEntry, relPath, findings);
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "ai-surface",
    lyseRuleId: RULE_ID,
    defaultSeverity: "info",
    shortDescription: "Component manifest entry completeness (props / variants / examples)",
    fullDescription:
      "For each component entry in a lyse-style component manifest (`components.json` / `lyse.components.json`), checks that the entry documents `props` (non-empty array), `examples` (non-empty array), and — when `variants` is present — that it is not an empty array. Silent when no manifest exists (the `ai-surface/component-manifest-json` rule owns the absence signal). Array-form manifests only (object-form manifests are structure-only in lyse convention).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/ai-surface-component-manifest-completeness.md",
    rationale: `Why it matters

A component manifest that lists only \`name\` and \`sourceFile\` tells MCP servers WHERE a component lives but not WHAT it does. Agents still have to read the source file to discover props, variants, and usage examples — negating the 5× cost reduction the manifest is meant to deliver.

This rule closes the gap: a complete entry lets an MCP tool answer "how do I use Button?" with a 50-token lookup instead of a 500-token file read.

Severity is intentionally informational — the manifest works for discovery without completeness data; completeness is a quality improvement, not a correctness issue.`,
    examples: [
      {
        good: JSON.stringify({
          components: [{
            name: "Button",
            sourceFile: "src/button.tsx",
            props: [{ name: "variant", type: "string" }],
            variants: ["primary", "secondary"],
            examples: ["<Button variant=\"primary\">Save</Button>"],
          }],
        }),
        bad: JSON.stringify({
          components: [{ name: "Button", sourceFile: "src/button.tsx" }],
        }),
      },
    ],
    allowlist: [
      "shadcn/ui `components.json` (CLI config) — detected via `$schema` or `aliases` and skipped",
      "manifests with no `components` array (or empty array) — skipped silently",
      "object-form manifests (keyed by component name) — not checked for completeness (structure-only convention)",
      "entries without a `name` field — skipped (manifest-json owns the validation)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
