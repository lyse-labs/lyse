import type { RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import {
  isVendoredOrResetFile,
  isLowSignalValueFile,
  isSchemaOrDataFile,
  isInCommentOrUrl,
} from "./_skip-context.js";
import { createLyseRule } from "./_rule-module.js";
import { isScored } from "../graph/query.js";

// ─── Value-type classification ────────────────────────────────────────────────
//
// The ownership boundary:
//   - value is a COLOR → owned by tokens/no-hardcoded-color (skip here)
//   - value is a var() reference → token use (skip here)
//   - value is any other literal (12px, 1fr, 0.5rem, 14px …) → THIS rule flags it
//
// COLOR heuristics (must stay in sync with tokens-no-hardcoded-color.ts):
//   1. Hex literal: #RGB / #RRGGBB / #RGBA / #RRGGBBAA
//   2. CSS color functions: rgb( rgba( hsl( hsla( oklch( oklab( lab( lch(
//   3. Named CSS colors (comprehensive list, no eval risk)

const COLOR_HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

// Covers the prefix of any CSS color function
const COLOR_FUNC_RE = /^(?:rgba?|hsla?|oklch|oklab|lab|lch)\s*\(/i;

// Named CSS colors (Level 4 full list — static, no eval risk)
const CSS_NAMED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
  "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
  "burlywood", "cadetblue", "chartreuse", "chocolate", "coral",
  "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred",
  "darksalmon", "darkseagreen", "darkslateblue", "darkslategray",
  "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite",
  "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
  "gray", "green", "greenyellow", "grey", "honeydew", "hotpink",
  "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush",
  "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue",
  "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow",
  "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen",
  "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred",
  "midnightblue", "mintcream", "mistyrose", "moccasin", "navajowhite",
  "navy", "oldlace", "olive", "olivedrab", "orange", "orangered", "orchid",
  "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip",
  "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple",
  "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown",
  "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue",
  "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan",
  "teal", "thistle", "tomato", "transparent", "turquoise", "violet",
  "wheat", "white", "whitesmoke", "yellow", "yellowgreen",
  // CSS keywords also covered here
  "currentcolor", "inherit", "initial", "unset", "revert",
]);

/**
 * Returns true when the bracket value is a color — owned by tokens/no-hardcoded-color.
 * This rule must NOT flag those.
 */
function isColorValue(value: string): boolean {
  const v = value.trim();
  if (COLOR_HEX_RE.test(v)) return true;
  if (COLOR_FUNC_RE.test(v)) return true;
  if (CSS_NAMED_COLORS.has(v.toLowerCase())) return true;
  return false;
}

/**
 * Returns true when the bracket value is a CSS variable / token reference.
 * e.g. var(--sidebar), var(--spacing-4)
 */
function isVarReference(value: string): boolean {
  return value.trim().startsWith("var(");
}

/**
 * Returns true when the bracket value is a CSS math function (calc/min/max/clamp).
 * These functions are owned by layout math, not the scale bypass concern.
 * e.g. w-[calc(100%-var(--sidebar))], h-[min(50vh,var(--max-h))]
 *
 * Known recall gap: a hardcoded literal embedded inside a math function
 * (e.g. `max(var(--min),320px)`) is exempted whole, so the inner `320px` is
 * NOT flagged. Accepted for now — the math wrapper signals deliberate layout
 * intent. Recall against real code is bounded by this; promotion measurement
 * treats it as a documented limitation, not a false negative to chase.
 */
function isCssMathFunction(value: string): boolean {
  const v = value.trim();
  return (
    v.startsWith("calc(") ||
    v.startsWith("min(") ||
    v.startsWith("max(") ||
    v.startsWith("clamp(")
  );
}

// Matches Tailwind arbitrary utilities: <prefix>-[<value>]
// e.g. p-[12px], text-[14px], w-[37px], gap-[10px], rounded-[3px], leading-[19px]
// Requires a word-boundary before the prefix and captures the value inside brackets.
const TW_ARBITRARY_RE = /\b([a-z][a-z-]*)-\[([^\]]+)\]/g;

function locationFromIndex(source: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (ctx.graph && !isScored(ctx.graph, f.path)) continue;
    if (!ctx.graph && (isVendoredOrResetFile(f.path) || isLowSignalValueFile(f.path) || isSchemaOrDataFile(f.path))) continue;

    const source = f.source;
    TW_ARBITRARY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = TW_ARBITRARY_RE.exec(source)) !== null) {
      const fullMatch = m[0]!;
      const value = m[2]!;

      // Skip values that are colors (owned by tokens/no-hardcoded-color)
      if (isColorValue(value)) continue;
      // Skip var() token references (compliant token use)
      if (isVarReference(value)) continue;
      // Skip CSS math functions (calc/min/max/clamp — layout math, not scale bypass)
      if (isCssMathFunction(value)) continue;
      // Skip matches inside comments / URLs
      if (isInCommentOrUrl(source, m.index)) continue;

      opportunities++;
      const loc = locationFromIndex(source, m.index);
      const lineText = source.split("\n")[loc.line - 1]?.trim().slice(0, 120);

      findings.push({
        ruleId: "components/no-arbitrary-tailwind",
        axis: "components",
        severity: "warning",
        location: { file: f.path, line: loc.line, column: loc.column },
        message: `Arbitrary Tailwind value \`${fullMatch}\` bypasses the scale — use a design token or scale step instead`,
        ...(lineText !== undefined && { context: lineText }),
      });
    }
  }

  for (const b of files.cssInJs) {
    if (isPathExcluded(b.path, ctx.excludePaths)) continue;
    if (ctx.graph && !isScored(ctx.graph, b.path)) continue;
    if (!ctx.graph && (isVendoredOrResetFile(b.path) || isLowSignalValueFile(b.path))) continue;

    const source = b.content;
    TW_ARBITRARY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = TW_ARBITRARY_RE.exec(source)) !== null) {
      const fullMatch = m[0]!;
      const value = m[2]!;

      if (isColorValue(value)) continue;
      if (isVarReference(value)) continue;
      if (isCssMathFunction(value)) continue;
      if (isInCommentOrUrl(source, m.index)) continue;

      opportunities++;
      findings.push({
        ruleId: "components/no-arbitrary-tailwind",
        axis: "components",
        severity: "warning",
        location: { file: b.path, line: b.line, column: 1 },
        message: `Arbitrary Tailwind value \`${fullMatch}\` bypasses the scale — use a design token or scale step instead`,
      });
    }
  }

  return { findings, opportunities };
};

export const rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: "components/no-arbitrary-tailwind",
    defaultSeverity: "warning",
    shortDescription: "Disallow non-color arbitrary Tailwind values",
    fullDescription:
      "Arbitrary Tailwind utilities (e.g. `p-[12px]`, `text-[14px]`, `w-[37px]`) bypass the configured design scale. These literal bracket values embed hardcoded spacing, sizing, or typography outside any token contract — making token-based refactors miss them silently. Color bracket values (e.g. `bg-[#fff]`) are handled by `tokens/no-hardcoded-color`.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-no-arbitrary-tailwind.md",
    rationale: `Why it matters

Arbitrary Tailwind values short-circuit the design system contract the same way inline styles do. A spacing change (4→5px base) or a typography scale update won't catch \`text-[14px]\` — the drift is invisible to token-based tooling.

The color variant (\`bg-[#fff]\`) is already handled by \`tokens/no-hardcoded-color\`. This rule covers the non-color remainder: spacing, sizing, typography, layout, and any other literal scale bypass.`,
    examples: [
      { good: '<div className="p-4 text-sm">', bad: '<div className="p-[12px] text-[14px]">' },
      { good: '<div className="w-full">', bad: '<div className="w-[37px]">' },
      { good: '<div className="gap-4">', bad: '<div className="gap-[10px]">' },
    ],
    allowlist: [],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  singleFileCapable: true,
});
