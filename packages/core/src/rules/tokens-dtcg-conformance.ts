import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
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
import {
  isDtcgAlias,
  isDtcgGroup,
  isDtcgToken,
  parseAliasPath,
  type DtcgDocument,
  type DtcgToken,
  type DtcgType,
} from "../tokens/dtcg-model.js";
import { normalizeToDtcg } from "../tokens/normalizer.js";

const MAX_FILE_BYTES = 1_000_000;
const RULE_ID = "tokens/dtcg-conformance";

/**
 * Discovers DTCG-shaped JSON files under the repo:
 *   - `**\/*.tokens.json`
 *   - `tokens/**\/*.json`
 *   - any `*.json` whose top-level value contains a `$value` somewhere (heuristic)
 *
 * Files larger than 1 MB are skipped to avoid pathological cases. Files
 * matched by `ctx.excludePaths` are skipped.
 */
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
    if (isPathExcluded(rel, ctx.excludePaths)) continue;
    out.add(rel);
  }
  return Array.from(out).sort();
}

function readJsonIfSmall(absPath: string): unknown | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function looksLikeDtcg(data: unknown): boolean {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return false;
  return hasAnyValueKey(data, 4);
}

function hasAnyValueKey(node: unknown, depthBudget: number): boolean {
  if (depthBudget < 0) return false;
  if (typeof node !== "object" || node === null || Array.isArray(node)) return false;
  for (const [k, v] of Object.entries(node)) {
    if (k === "$value") return true;
    if (typeof v === "object" && v !== null && hasAnyValueKey(v, depthBudget - 1)) return true;
  }
  return false;
}

/**
 * Heuristic that infers a likely `$type` from a token's value, used to flag
 * tokens that have `$value` but no `$type` when one is clearly inferable.
 */
function inferTypeFromValue(value: unknown): DtcgType | null {
  if (typeof value === "string") {
    const v = value.trim();
    if (isDtcgAlias(v)) return null;
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return "color";
    if (/^(rgb|rgba|hsl|hsla|oklch|oklab|color|lab|lch)\s*\(/i.test(v)) return "color";
    if (/^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|ch|ex|pt|pc|cm|mm|in)$/i.test(v)) return "dimension";
    if (/^-?\d+(\.\d+)?(ms|s)$/i.test(v)) return "duration";
    if (/^cubic-bezier\s*\(/i.test(v)) return "cubicBezier";
    return null;
  }
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) {
    if (value.length === 4 && value.every((n) => typeof n === "number")) return "cubicBezier";
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if ("offsetX" in obj && "offsetY" in obj && "blur" in obj && "color" in obj) return "shadow";
    if (("fontFamily" in obj || "fontSize" in obj || "fontWeight" in obj || "lineHeight" in obj) && !("offsetX" in obj)) {
      return "typography";
    }
    if ("color" in obj && "width" in obj && "style" in obj) return "border";
  }
  return null;
}

interface ShadowShape {
  ok: boolean;
  reason?: string;
}

function validateShadowValue(value: unknown): ShadowShape {
  if (isDtcgAlias(value)) return { ok: true };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "shadow $value must be an object (or array of objects) with offsetX/offsetY/blur/color" };
  }
  const obj = value as Record<string, unknown>;
  for (const field of ["offsetX", "offsetY", "blur", "color"] as const) {
    if (!(field in obj)) return { ok: false, reason: `shadow $value missing required field "${field}"` };
  }
  return { ok: true };
}

function validateTypographyValue(value: unknown): ShadowShape {
  if (isDtcgAlias(value)) return { ok: true };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "typography $value must be an object with at least one of fontFamily/fontSize/fontWeight/lineHeight/letterSpacing" };
  }
  const obj = value as Record<string, unknown>;
  const known = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"];
  if (!known.some((k) => k in obj)) {
    return { ok: false, reason: "typography $value has no recognized typography field" };
  }
  return { ok: true };
}

function validateBorderValue(value: unknown): ShadowShape {
  if (isDtcgAlias(value)) return { ok: true };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "border $value must be an object with color/width/style" };
  }
  const obj = value as Record<string, unknown>;
  for (const field of ["color", "width", "style"] as const) {
    if (!(field in obj)) return { ok: false, reason: `border $value missing required field "${field}"` };
  }
  return { ok: true };
}

function aliasResolves(doc: DtcgDocument, alias: string): boolean {
  const segments = parseAliasPath(alias);
  if (segments.length === 0) return false;
  let cur: unknown = doc;
  for (const seg of segments) {
    if (typeof cur !== "object" || cur === null) return false;
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) return false;
  }
  return isDtcgToken(cur) || isDtcgGroup(cur);
}

interface WalkOutcome {
  tokenCount: number;
  inheritedTypeConflicts: { path: string; groupType: DtcgType; tokenType: DtcgType }[];
  brokenAliases: { path: string; alias: string }[];
  missingInferableTypes: { path: string; inferred: DtcgType }[];
  shapeIssues: { path: string; reason: string }[];
}

function walkDocument(doc: DtcgDocument): WalkOutcome {
  const result: WalkOutcome = {
    tokenCount: 0,
    inheritedTypeConflicts: [],
    brokenAliases: [],
    missingInferableTypes: [],
    shapeIssues: [],
  };

  const visit = (node: unknown, path: string[], inheritedType: DtcgType | undefined) => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    if (isDtcgToken(node)) {
      result.tokenCount++;
      const token = node as DtcgToken<unknown>;
      const value = token.$value;
      const effectiveType = token.$type ?? inheritedType;

      if (token.$type !== undefined && inheritedType !== undefined && token.$type !== inheritedType) {
        // Note: child overriding parent is allowed per DTCG; not flagged here.
      }

      if (token.$type === undefined) {
        const inferred = inferTypeFromValue(value);
        if (inferred && !isDtcgAlias(value)) {
          result.missingInferableTypes.push({ path: path.join("."), inferred });
        }
      }

      if (isDtcgAlias(value)) {
        // Alias is validated against the document root by the caller.
        result.brokenAliases.push({ path: path.join("."), alias: value as string });
      } else {
        if (effectiveType === "shadow") {
          const r = validateShadowValue(value);
          if (!r.ok && r.reason) result.shapeIssues.push({ path: path.join("."), reason: r.reason });
        } else if (effectiveType === "typography") {
          const r = validateTypographyValue(value);
          if (!r.ok && r.reason) result.shapeIssues.push({ path: path.join("."), reason: r.reason });
        } else if (effectiveType === "border") {
          const r = validateBorderValue(value);
          if (!r.ok && r.reason) result.shapeIssues.push({ path: path.join("."), reason: r.reason });
        }
      }
      return;
    }
    if (!isDtcgGroup(node)) return;

    const groupType = (node as { $type?: DtcgType }).$type ?? inheritedType;
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$")) continue;
      const child = v;
      const childPath = [...path, k];

      // Group/token $type conflict: if a child group declares a different $type
      // than its parent group's $type, flag (DTCG allows it but it's usually a bug).
      if (
        isDtcgGroup(child) &&
        (child as { $type?: DtcgType }).$type !== undefined &&
        inheritedType !== undefined &&
        (child as { $type?: DtcgType }).$type !== inheritedType
      ) {
        // Not a hard error — DTCG permits group-level $type overrides. Skip for now.
      }

      if (
        isDtcgToken(child) &&
        groupType !== undefined &&
        (child as DtcgToken<unknown>).$type !== undefined &&
        (child as DtcgToken<unknown>).$type !== groupType
      ) {
        result.inheritedTypeConflicts.push({
          path: childPath.join("."),
          groupType,
          tokenType: (child as DtcgToken<unknown>).$type as DtcgType,
        });
      }

      visit(child, childPath, groupType);
    }
  };

  visit(doc, [], undefined);

  // Filter brokenAliases: remove ones that resolve.
  result.brokenAliases = result.brokenAliases.filter((b) => !aliasResolves(doc, b.alias));

  return result;
}

const evaluate = async (
  ctx: RuleContext,
  _files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  const relFiles = discoverDtcgFiles(ctx);
  for (const rel of relFiles) {
    const abs = isAbsolute(rel) ? rel : join(ctx.repoRoot, rel);
    const data = readJsonIfSmall(abs);
    if (data === null) continue;
    if (!looksLikeDtcg(data)) continue;

    const display = relative(ctx.repoRoot, abs) || rel;

    const normalized = normalizeToDtcg({ source: "dtcg", data });
    for (const w of normalized.warnings) {
      // The normalizer also emits "token at X has no $type" — we re-emit
      // those below with richer "inferred type" context, so suppress the
      // normalizer's duplicate here.
      if (w.startsWith("dtcg: token at") && w.includes("has no $type")) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: display, line: 1, column: 1 },
        message: `DTCG: ${w}`,
      });
    }

    const walked = walkDocument(normalized.document);
    opportunities += walked.tokenCount;

    for (const m of walked.missingInferableTypes) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: display, line: 1, column: 1 },
        message: `Token "${m.path}" has $value but no $type (value looks like ${m.inferred})`,
        suggestion: `add "$type": "${m.inferred}"`,
      });
    }

    for (const a of walked.brokenAliases) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: display, line: 1, column: 1 },
        message: `Token "${a.path}" references unresolved alias ${a.alias}`,
      });
    }

    for (const s of walked.shapeIssues) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: display, line: 1, column: 1 },
        message: `Token "${s.path}": ${s.reason}`,
      });
    }

    for (const c of walked.inheritedTypeConflicts) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: "warning",
        location: { file: display, line: 1, column: 1 },
        message: `Token "${c.path}" has $type "${c.tokenType}" but parent group declares $type "${c.groupType}"`,
      });
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "tokens",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "DTCG v2025.10 conformance for token JSON files",
    fullDescription:
      "Validates token JSON files (`*.tokens.json`, files under `tokens/**`) against the W3C Design Tokens Community Group spec (DTCG v2025.10). Flags tokens missing `$type` when it can be inferred from the value, broken aliases (`{group.token}` references that don't resolve), and composite tokens (shadow, typography, border) with the wrong shape.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-dtcg-conformance.md",
    rationale: `Why it matters

DTCG conformance is the contract between design and code. Non-conformant token files don't survive round-trips through Style Dictionary, Tokens Studio, or Figma Tokens plugins — they silently corrupt theming and break dark-mode propagation.

The most common drift modes are: tokens with \`$value\` but no \`$type\` (Style Dictionary can't infer the right transform), aliases that point to renamed paths after a refactor, and composite shadow tokens with legacy string shapes that no longer parse.`,
    examples: [
      {
        good: '{ "color": { "brand": { "$value": "#2563eb", "$type": "color" } } }',
        bad: '{ "color": { "brand": { "$value": "#2563eb" } } }',
      },
      {
        good: '{ "shadow": { "sm": { "$type": "shadow", "$value": { "offsetX": "0", "offsetY": "1px", "blur": "2px", "color": "rgba(0,0,0,0.1)" } } } }',
        bad: '{ "shadow": { "sm": { "$type": "shadow", "$value": "0 1px 2px rgba(0,0,0,0.1)" } } }',
      },
      {
        good: '{ "semantic": { "primary": { "$value": "{color.brand}", "$type": "color" } } } (when color.brand exists)',
        bad: '{ "semantic": { "primary": { "$value": "{color.brandd}", "$type": "color" } } } (typo, no such path)',
      },
    ],
    allowlist: [
      "files matching `*.tokens.json` heuristic but containing only $-prefixed metadata (no $value anywhere) — skipped, not flagged",
      "files larger than 1 MB — skipped to avoid pathological cases",
      "files matching `ctx.excludePaths` config",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

// Exported for unit tests
export const _internal = {
  discoverDtcgFiles,
  walkDocument,
  looksLikeDtcg,
  inferTypeFromValue,
};
