import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import fg from "fast-glob";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  Severity,
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

interface ValueShape {
  ok: boolean;
  reason?: string;
}

// ----- Type-specific value validators (DTCG §8) -----

const NAMED_CSS_COLORS = new Set<string>([
  "transparent", "currentcolor", "inherit", "initial", "unset", "revert",
  // CSS4 named colors (subset — covers ~99 % of real-world usage).
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
  "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
  "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue",
  "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod",
  "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", "darkslateblue",
  "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen",
  "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray",
  "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred",
  "indigo", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen",
  "lemonchiffon", "lightblue", "lightcoral", "lightcyan", "lightgoldenrodyellow",
  "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", "lightseagreen",
  "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow",
  "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace",
  "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru",
  "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
  "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
  "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
  "slategrey", "snow", "springgreen", "steelblue", "tan", "teal",
  "thistle", "tomato", "turquoise", "violet", "wheat", "white",
  "whitesmoke", "yellow", "yellowgreen",
]);

const COLOR_FN_RE = /^(rgb|rgba|hsl|hsla|oklch|oklab|color|lab|lch|hwb)\s*\(/i;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_UNIT_RE = /^-?\d+(\.\d+)?(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt|pc|cm|mm|in|q|fr|dvh|dvw|svh|svw|lvh|lvw)$/i;
const DURATION_RE = /^-?\d+(\.\d+)?(ms|s)$/i;
const NAMED_FONT_WEIGHTS = new Set<string>([
  "normal", "bold", "lighter", "bolder",
  "thin", "hairline", "extra-light", "extralight", "ultra-light", "ultralight", "light",
  "regular", "book", "medium", "semi-bold", "semibold", "demi-bold",
  "extra-bold", "extrabold", "ultra-bold", "ultrabold",
  "black", "heavy", "extra-black", "extrablack", "ultra-black", "ultrablack",
]);
const STROKE_STYLES = new Set<string>([
  "solid", "dashed", "dotted", "double", "groove", "ridge", "outset", "inset", "none", "hidden",
]);
const CUBIC_BEZIER_FN_RE = /^cubic-bezier\s*\(/i;
const NAMED_EASINGS = new Set<string>([
  "linear", "ease", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end",
]);

function validateColorValue(value: unknown): ValueShape {
  // DTCG canonical color object: { colorSpace, components: number[], alpha?, hex? }
  // Emitted by Tokens Studio, Figma exports, Style Dictionary v4.
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (
      typeof obj["colorSpace"] === "string" &&
      Array.isArray(obj["components"]) &&
      obj["components"].every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return { ok: true };
    }
  }
  if (typeof value !== "string") {
    return { ok: false, reason: `color $value must be a CSS color string or a DTCG color object, got ${typeof value}` };
  }
  const v = value.trim();
  if (HEX_RE.test(v)) return { ok: true };
  if (COLOR_FN_RE.test(v) && v.endsWith(")")) return { ok: true };
  if (NAMED_CSS_COLORS.has(v.toLowerCase())) return { ok: true };
  return { ok: false, reason: `color $value "${value}" is not a recognized CSS color (hex, rgb()/rgba(), hsl()/hsla(), oklch(), or named)` };
}

function validateDimensionValue(value: unknown): ValueShape {
  // DTCG canonical dimension object: { value: number, unit: "px" | "rem" }.
  // Mirrors the duration validator (which already accepts the object form).
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj["value"] === "number" && (obj["unit"] === "px" || obj["unit"] === "rem")) {
      return { ok: true };
    }
  }
  if (typeof value !== "string") {
    return { ok: false, reason: `dimension $value must be a string with a unit or a DTCG dimension object, got ${typeof value}` };
  }
  const v = value.trim();
  if (v === "0") {
    return { ok: false, reason: `dimension $value "0" is missing a unit (use "0px" or another unit)` };
  }
  if (CSS_UNIT_RE.test(v)) return { ok: true };
  return { ok: false, reason: `dimension $value "${value}" lacks a recognized CSS unit (px, rem, em, %, vh, vw, ...)` };
}

function validateFontWeightValue(value: unknown): ValueShape {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 1 && value <= 1000) return { ok: true };
    return { ok: false, reason: `fontWeight $value must be an integer in [1, 1000], got ${value}` };
  }
  if (typeof value === "string") {
    if (NAMED_FONT_WEIGHTS.has(value.trim().toLowerCase())) return { ok: true };
    const n = Number(value);
    if (Number.isInteger(n) && n >= 1 && n <= 1000) return { ok: true };
    return { ok: false, reason: `fontWeight $value "${value}" is not a named weight or an integer in [1, 1000]` };
  }
  return { ok: false, reason: `fontWeight $value must be an integer or named weight, got ${typeof value}` };
}

function validateDurationValue(value: unknown): ValueShape {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.value === "number" && typeof obj.unit === "string") return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: `duration $value must be a number+unit string (e.g. "200ms"), got ${typeof value}` };
  }
  const v = value.trim();
  if (DURATION_RE.test(v)) return { ok: true };
  return { ok: false, reason: `duration $value "${value}" is not a recognized duration (e.g. "200ms", "0.2s")` };
}

function validateCubicBezierValue(value: unknown): ValueShape {
  if (Array.isArray(value)) {
    if (value.length === 4 && value.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return { ok: true };
    }
    return { ok: false, reason: `cubicBezier $value array must have exactly 4 finite numbers` };
  }
  if (typeof value === "string") {
    const v = value.trim();
    if (CUBIC_BEZIER_FN_RE.test(v) && v.endsWith(")")) return { ok: true };
    if (NAMED_EASINGS.has(v.toLowerCase())) return { ok: true };
    return { ok: false, reason: `cubicBezier $value "${value}" is not a cubic-bezier() expression, named easing, or 4-number array` };
  }
  return { ok: false, reason: `cubicBezier $value must be an array of 4 numbers or a cubic-bezier() string, got ${typeof value}` };
}

function validateNumberValue(value: unknown): ValueShape {
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true };
  return { ok: false, reason: `number $value must be a finite number, got ${typeof value}` };
}

function validateFontFamilyValue(value: unknown): ValueShape {
  if (typeof value === "string" && value.trim().length > 0) return { ok: true };
  if (Array.isArray(value) && value.length > 0 && value.every((s) => typeof s === "string" && s.length > 0)) {
    return { ok: true };
  }
  return { ok: false, reason: `fontFamily $value must be a non-empty string or array of strings` };
}

function validateStrokeStyleValue(value: unknown): ValueShape {
  if (typeof value === "string" && STROKE_STYLES.has(value.trim().toLowerCase())) return { ok: true };
  return { ok: false, reason: `strokeStyle $value must be one of: ${Array.from(STROKE_STYLES).join(", ")}` };
}

function validateShadowValue(value: unknown): ValueShape {
  if (isDtcgAlias(value)) return { ok: true };
  if (Array.isArray(value)) {
    for (const layer of value) {
      const r = validateShadowValue(layer);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  if (typeof value !== "object" || value === null) {
    return { ok: false, reason: "shadow $value must be an object (or array of objects) with offsetX/offsetY/blur/color" };
  }
  const obj = value as Record<string, unknown>;
  for (const field of ["offsetX", "offsetY", "blur", "color"] as const) {
    if (!(field in obj)) return { ok: false, reason: `shadow $value missing required field "${field}"` };
  }
  return { ok: true };
}

function validateTypographyValue(value: unknown): ValueShape {
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

function validateBorderValue(value: unknown): ValueShape {
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

function validateTransitionValue(value: unknown): ValueShape {
  if (isDtcgAlias(value)) return { ok: true };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "transition $value must be an object with duration/timingFunction" };
  }
  const obj = value as Record<string, unknown>;
  for (const field of ["duration", "timingFunction"] as const) {
    if (!(field in obj)) return { ok: false, reason: `transition $value missing required field "${field}"` };
  }
  return { ok: true };
}

function validateGradientValue(value: unknown): ValueShape {
  if (isDtcgAlias(value)) return { ok: true };
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "gradient $value must be a non-empty array of { color, position } stops" };
  }
  for (const stop of value) {
    if (typeof stop !== "object" || stop === null) {
      return { ok: false, reason: "gradient $value stops must be objects with color/position" };
    }
    const s = stop as Record<string, unknown>;
    if (!("color" in s) || !("position" in s)) {
      return { ok: false, reason: "gradient $value stop missing color or position" };
    }
  }
  return { ok: true };
}

/**
 * Dispatches to the right type-specific validator for a non-alias value.
 * Returns null when the type has no validator or the value is an alias.
 */
function validateTypedValue(type: DtcgType, value: unknown): ValueShape | null {
  if (isDtcgAlias(value)) return null;
  switch (type) {
    case "color": return validateColorValue(value);
    case "dimension": return validateDimensionValue(value);
    case "fontFamily": return validateFontFamilyValue(value);
    case "fontWeight": return validateFontWeightValue(value);
    case "duration": return validateDurationValue(value);
    case "cubicBezier": return validateCubicBezierValue(value);
    case "number": return validateNumberValue(value);
    case "strokeStyle": return validateStrokeStyleValue(value);
    case "shadow": return validateShadowValue(value);
    case "typography": return validateTypographyValue(value);
    case "border": return validateBorderValue(value);
    case "transition": return validateTransitionValue(value);
    case "gradient": return validateGradientValue(value);
    case "string": return null;
    default: return null;
  }
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

/**
 * Per-token allowlist: a token may opt out of dtcg-conformance checks via
 *
 *     "$extensions": { "lyse": { "disable": ["tokens/dtcg-conformance"] } }
 *
 * This is the standard DTCG escape hatch — `$extensions` is reserved for
 * tool-specific metadata.
 */
function isTokenDisabled(token: DtcgToken<unknown>): boolean {
  const ext = (token as { $extensions?: Record<string, unknown> }).$extensions;
  if (typeof ext !== "object" || ext === null) return false;
  const lyse = (ext as Record<string, unknown>).lyse;
  if (typeof lyse !== "object" || lyse === null) return false;
  const disable = (lyse as Record<string, unknown>).disable;
  if (Array.isArray(disable)) {
    return disable.some((v) => v === RULE_ID || v === "all");
  }
  if (typeof disable === "string") {
    return disable === RULE_ID || disable === "all";
  }
  return false;
}

interface TokenIssue {
  path: string;
  severity: Severity;
  message: string;
  suggestion?: string;
}

interface WalkOutcome {
  tokenCount: number;
  issues: TokenIssue[];
}

function walkDocument(doc: DtcgDocument): WalkOutcome {
  const result: WalkOutcome = { tokenCount: 0, issues: [] };

  const visit = (node: unknown, path: string[], inheritedType: DtcgType | undefined) => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return;
    if (isDtcgToken(node)) {
      result.tokenCount++;
      const token = node as DtcgToken<unknown>;
      if (isTokenDisabled(token)) return;
      const value = token.$value;
      const effectiveType = token.$type ?? inheritedType;
      const tokenPath = path.join(".");

      // --- $type presence ---
      if (token.$type === undefined && inheritedType === undefined) {
        const inferred = !isDtcgAlias(value) ? inferTypeFromValue(value) : null;
        const msg = inferred
          ? `Token "${tokenPath}" has $value but no $type (value looks like ${inferred})`
          : `Token "${tokenPath}" has $value but no $type`;
        result.issues.push({
          path: tokenPath,
          severity: "warning",
          message: msg,
          ...(inferred ? { suggestion: `add "$type": "${inferred}"` } : { suggestion: `add an explicit "$type" — DTCG recommends every token declare its type` }),
        });
      }

      // --- alias resolution ---
      if (isDtcgAlias(value)) {
        if (!aliasResolves(doc, value as string)) {
          result.issues.push({
            path: tokenPath,
            severity: "error",
            message: `Token "${tokenPath}" references unresolved alias ${value as string}`,
          });
        }
      } else if (effectiveType !== undefined) {
        // --- type-specific value validation ---
        const r = validateTypedValue(effectiveType, value);
        if (r && !r.ok && r.reason) {
          const compositeTypes: DtcgType[] = ["shadow", "typography", "border", "transition", "gradient"];
          const severity: Severity = compositeTypes.includes(effectiveType) ? "warning" : "error";
          result.issues.push({
            path: tokenPath,
            severity,
            message: `Token "${tokenPath}": ${r.reason}`,
          });
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

      if (
        isDtcgToken(child) &&
        groupType !== undefined &&
        (child as DtcgToken<unknown>).$type !== undefined &&
        (child as DtcgToken<unknown>).$type !== groupType
      ) {
        result.issues.push({
          path: childPath.join("."),
          severity: "warning",
          message: `Token "${childPath.join(".")}" has $type "${(child as DtcgToken<unknown>).$type as DtcgType}" but parent group declares $type "${groupType}"`,
        });
      }

      visit(child, childPath, groupType);
    }
  };

  visit(doc, [], undefined);
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

    for (const issue of walked.issues) {
      findings.push({
        ruleId: RULE_ID,
        axis: "tokens",
        severity: issue.severity,
        location: { file: display, line: 1, column: 1 },
        message: issue.message,
        ...(issue.suggestion ? { suggestion: issue.suggestion } : {}),
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
    shortDescription: "Strict W3C DTCG validation for token JSON files",
    fullDescription:
      "Validates token JSON files (`*.tokens.json`, files under `tokens/**`) against the W3C Design Tokens Community Group draft. Per-leaf checks: every token must declare `$value` and SHOULD declare `$type`; alias references `{group.name}` must resolve; type-specific values are validated (color = CSS color, dimension = number+unit, fontWeight integer 1-1000 or named, duration = number+unit, cubicBezier = 4-number array or named easing, number = finite number, fontFamily = non-empty string|array). Composite tokens (shadow, typography, border, transition, gradient) are shape-checked.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/tokens-dtcg-conformance.md",
    rationale: `Why it matters

DTCG conformance is the contract between design and code. Non-conformant token files don't survive round-trips through Style Dictionary, Tokens Studio, or Figma Tokens plugins — they silently corrupt theming and break dark-mode propagation.

The most common drift modes are: tokens with \`$value\` but no \`$type\` (Style Dictionary can't infer the right transform), aliases that point to renamed paths after a refactor, type-claimed but malformed values (\`$type: "color"\` with \`$value: "blu"\`, \`$type: "dimension"\` with \`$value: "16"\` — no unit), and composite shadow tokens with legacy string shapes that no longer parse.`,
    examples: [
      {
        good: '{ "color": { "brand": { "$value": "#2563eb", "$type": "color" } } }',
        bad: '{ "color": { "brand": { "$value": "#2563eb" } } }',
      },
      {
        good: '{ "spacing": { "sm": { "$value": "8px", "$type": "dimension" } } }',
        bad: '{ "spacing": { "sm": { "$value": "8", "$type": "dimension" } } } (no unit)',
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
      "tokens declaring `$extensions.lyse.disable: [\"tokens/dtcg-conformance\"]` — skipped per the standard DTCG extension mechanism",
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
  validateColorValue,
  validateDimensionValue,
  validateFontWeightValue,
  validateDurationValue,
  validateCubicBezierValue,
  validateNumberValue,
  validateFontFamilyValue,
  validateStrokeStyleValue,
  validateShadowValue,
  validateTypographyValue,
  validateBorderValue,
  validateTransitionValue,
  validateGradientValue,
  validateTypedValue,
  isTokenDisabled,
};
