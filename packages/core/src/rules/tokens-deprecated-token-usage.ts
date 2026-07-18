import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import {
  isDtcgToken,
  isDtcgGroup,
  isDtcgAlias,
  parseAliasPath,
  type DtcgDocument,
  type DtcgToken,
} from "../tokens/dtcg-model.js";

const RULE_ID = "tokens/deprecated-token-usage";
const MAX_FILE_BYTES = 2_000_000;

function isPathExcluded(rel: string, excludePaths: string[]): boolean {
  return excludePaths.some((p) => rel === p || rel.startsWith(p.endsWith("/") ? p : `${p}/`));
}

function discoverDtcgFiles(ctx: RuleContext): string[] {
  if (!ctx.repoRoot) return [];
  let entries: string[] = [];
  try {
    entries = fg.sync(["**/*.tokens.json", "tokens/**/*.json", "**/tokens/**/*.json"], {
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
    if (!isPathExcluded(rel, ctx.excludePaths)) out.add(rel);
  }
  return Array.from(out).sort();
}

function readJsonIfSmall(absPath: string): unknown | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function looksLikeDtcg(data: unknown): data is DtcgDocument {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  return hasAnyValueKey(data, 6);
}

function hasAnyValueKey(node: unknown, depthBudget: number): boolean {
  if (depthBudget < 0 || typeof node !== "object" || node === null || Array.isArray(node)) return false;
  for (const [k, v] of Object.entries(node)) {
    if (k === "$value") return true;
    if (typeof v === "object" && v !== null && hasAnyValueKey(v, depthBudget - 1)) return true;
  }
  return false;
}

interface TokenRecord {
  path: string; // dot-joined group path, e.g. "color.brand.primary"
  deprecated: boolean;
  aliasTarget: string | null; // dot-joined target path when $value is an alias
  file: string;
}

/** Walks one DTCG document, appending every token (with deprecation + alias info). */
function collectTokens(node: DtcgDocument, prefix: string[], file: string, out: TokenRecord[]): void {
  for (const [key, entry] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (isDtcgToken(entry)) {
      const tok = entry as DtcgToken<unknown>;
      const path = [...prefix, key].join(".");
      const aliasTarget = isDtcgAlias(tok.$value) ? parseAliasPath(tok.$value).join(".") : null;
      out.push({ path, deprecated: tok.$deprecated !== undefined && tok.$deprecated !== false, aliasTarget, file });
    } else if (isDtcgGroup(entry)) {
      collectTokens(entry as DtcgDocument, [...prefix, key], file, out);
    }
  }
}

const evaluate = async (ctx: RuleContext, _files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (!ctx.repoRoot) return { findings, opportunities: 0 };

  const files = discoverDtcgFiles(ctx);
  if (files.length === 0) return { findings, opportunities: 0 };

  // Pass 1: collect every token across every file into one address space.
  const tokens: TokenRecord[] = [];
  for (const rel of files) {
    const data = readJsonIfSmall(join(ctx.repoRoot, rel));
    if (looksLikeDtcg(data)) collectTokens(data, [], rel, tokens);
  }
  if (tokens.length === 0) return { findings, opportunities: 0 };

  const deprecatedPaths = new Set(tokens.filter((t) => t.deprecated).map((t) => t.path));
  if (deprecatedPaths.size === 0) return { findings, opportunities: tokens.length };

  // Pass 2: any token aliasing a deprecated token is internal drift.
  for (const t of tokens) {
    if (t.aliasTarget !== null && deprecatedPaths.has(t.aliasTarget) && !t.deprecated) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: t.file, line: 1, column: 1 },
        message: `Token \`${t.path}\` aliases the deprecated token \`${t.aliasTarget}\` — consumers (and AI agents) inherit a deprecated value`,
        suggestion: `repoint \`${t.path}\` at the deprecated token's replacement, or remove it`,
      });
    }
  }
  return { findings, opportunities: tokens.length };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Tokens should not alias a deprecated token",
    fullDescription:
      "Walks the design system's DTCG token files and flags any token whose `$value` is an alias resolving to a token marked `$deprecated`. Aliasing a deprecated token silently propagates a deprecated value to every consumer of the aliasing token — including AI agents that resolve tokens. Deterministic structural check: synthetic precision equals real precision. Emits nothing when no token is deprecated, or when no token aliases a deprecated one.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-deprecated-token-usage.md",
    rationale: `Why it matters

DTCG supports \`$deprecated\` (boolean or a string reason) to mark a token as on the way out. The contract is that consumers stop referencing it. When another token *aliases* a deprecated token, the deprecation is defeated: every consumer of the aliasing token transitively depends on the deprecated value, and an AI agent resolving the alias has no signal that it landed on deprecated state.

The check resolves aliases across all token files in one address space, so a cross-file alias to a deprecated token is caught. It only fires when a deprecated token exists AND is aliased, so a system with no deprecations (or clean deprecations) produces no findings.`,
    examples: [
      {
        good: '// tokens.json — alias points at a live token\n{ "color": { "old": { "$value": "#000", "$deprecated": "use color.ink" }, "ink": { "$value": "#111" }, "text": { "$value": "{color.ink}" } } }',
        bad: '// text aliases the deprecated token\n{ "color": { "old": { "$value": "#000", "$deprecated": true }, "text": { "$value": "{color.old}" } } }',
      },
    ],
    allowlist: [
      "token files matched by `excludePaths` in `.lyse.yaml`",
      "token files larger than 2 MB — skipped to avoid pathological cases",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
