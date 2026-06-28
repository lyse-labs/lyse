import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";
import { contrastRatio } from "../a11y/contrast.js";

const RULE_ID = "a11y/contrast-tokens";

/**
 * CSS keywords that carry no specific color and cannot be contrast-checked.
 * A pair where either side is one of these is skipped.
 */
const SKIP_KEYWORDS = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "initial",
  "unset",
  "revert",
  "none",
]);

/**
 * Matches a CSS custom-property reference: `var(--name)` or `var(--name, fallback)`.
 * Any var() reference is unresolvable without the DTCG forward map (which is not
 * stored in RuleContext — ctx.tokens is the reverse hex→paths map, not path→hex).
 * Skip all var() references: recall-safe over guessing.
 */
const VAR_RE = /^var\s*\(/i;

/**
 * Resolve a CSS color value to an opaque color string.
 *
 * - `var(--x)` → unresolvable (forward map not available in ctx) → null (skip)
 * - CSS keywords (transparent, currentColor, inherit, …) → null (skip)
 * - Literal color (hex, rgb, hsl, named) → return as-is; contrastRatio handles
 *   the parseability check and returns null if alpha < 1 or unparseable.
 *
 * This is intentionally conservative: any ambiguity → skip. The rule never
 * guesses a contrast verdict.
 */
function resolveColor(value: string, _ctx: RuleContext): string | null {
  const v = value.trim();

  // Skip CSS keywords that are not concrete colors
  if (SKIP_KEYWORDS.has(v.toLowerCase())) return null;

  // Skip var() references — forward map not available
  if (VAR_RE.test(v)) return null;

  // Literal value — return as-is
  return v;
}

/**
 * Returns true when the `background` shorthand value is clearly a solid color
 * (not gradient, url, multi-layer).
 *
 * Multi-layer backgrounds contain commas outside of function calls.
 * Gradients start with a known CSS gradient function.
 * url() is a non-color background.
 */
function isSolidBackground(value: string): boolean {
  const v = value.trim().toLowerCase();

  // url() backgrounds
  if (v.startsWith("url(")) return false;

  // Gradient functions
  if (
    v.startsWith("linear-gradient(") ||
    v.startsWith("radial-gradient(") ||
    v.startsWith("conic-gradient(") ||
    v.startsWith("repeating-linear-gradient(") ||
    v.startsWith("repeating-radial-gradient(") ||
    v.startsWith("repeating-conic-gradient(")
  ) {
    return false;
  }

  // Multi-layer: comma outside of all function calls
  let depth = 0;
  for (const ch of v) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) return false;
  }

  return true;
}

interface DeclarationBlock {
  source: string; // path for location reporting
  line: number;   // 1-based line of the rule/block start
  declarations: Record<string, string>; // prop → value
}

/**
 * Extract declaration blocks from a raw CSS/SCSS source string.
 * Each `selector { ... }` block becomes one DeclarationBlock.
 * Handles nested rules by treating each innermost block independently.
 */
function extractCssBlocks(source: string, filePath: string): DeclarationBlock[] {
  const blocks: DeclarationBlock[] = [];
  const lines = source.split("\n");

  // Build a simple line index for source positions
  const lineStartIndex: number[] = [];
  let idx = 0;
  for (const line of lines) {
    lineStartIndex.push(idx);
    idx += line.length + 1;
  }

  function indexToLine(charIdx: number): number {
    // Binary search
    let lo = 0;
    let hi = lineStartIndex.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const lineIdx = lineStartIndex[mid];
      if (lineIdx !== undefined && lineIdx <= charIdx) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1; // 1-based
  }

  // Find all { ... } blocks and parse their declarations
  let pos = 0;
  while (pos < source.length) {
    const openBrace = source.indexOf("{", pos);
    if (openBrace === -1) break;

    // Find matching close brace (handle nesting)
    let depth = 1;
    let closeBrace = openBrace + 1;
    while (closeBrace < source.length && depth > 0) {
      if (source[closeBrace] === "{") depth++;
      else if (source[closeBrace] === "}") depth--;
      closeBrace++;
    }
    closeBrace--; // points at the closing }

    const blockContent = source.slice(openBrace + 1, closeBrace);
    const declarations = parseDeclarations(blockContent);

    if (Object.keys(declarations).length > 0) {
      blocks.push({
        source: filePath,
        line: indexToLine(openBrace),
        declarations,
      });
    }

    pos = closeBrace + 1;
  }

  return blocks;
}

/**
 * Parse a CSS declaration block string into a prop→value map.
 * Handles declarations that may contain function calls with parens.
 */
function parseDeclarations(content: string): Record<string, string> {
  const r: Record<string, string> = {};

  // Split on semicolons, but only at depth 0 (not inside function calls)
  const statements: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of content) {
    if (ch === "(") {
      depth++;
      current += ch;
    } else if (ch === ")") {
      depth--;
      current += ch;
    } else if (ch === ";" && depth === 0) {
      statements.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) statements.push(current);

  for (const stmt of statements) {
    const colonIdx = stmt.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = stmt.slice(0, colonIdx).trim().toLowerCase();
    const val = stmt.slice(colonIdx + 1).trim();
    if (prop && val) {
      r[prop] = val;
    }
  }

  return r;
}

/**
 * Extract inline-style objects from TypeScript source.
 * Finds patterns like: style={{ color: '#xxx', background: '#yyy' }}
 * or style={{ color: '#xxx', backgroundColor: '#yyy' }}
 *
 * Returns array of { line, declarations } extracted from inline styles.
 */
function extractInlineStyleBlocks(source: string, filePath: string): DeclarationBlock[] {
  const blocks: DeclarationBlock[] = [];
  const lines = source.split("\n");

  const lineStartIndex: number[] = [];
  let idx = 0;
  for (const line of lines) {
    lineStartIndex.push(idx);
    idx += line.length + 1;
  }

  function indexToLine(charIdx: number): number {
    let lo = 0;
    let hi = lineStartIndex.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const lineIdx = lineStartIndex[mid];
      if (lineIdx !== undefined && lineIdx <= charIdx) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  }

  // Match `style={{` or `style={` followed by an object literal
  // We look for the pattern style={{ ... }} in JSX
  const styleRe = /style\s*=\s*\{\s*\{/g;
  let m: RegExpExecArray | null;

  while ((m = styleRe.exec(source)) !== null) {
    const openBrace = source.indexOf("{", m.index + m[0].indexOf("{"));
    // This is the outer { in style={{, we want the inner {
    const innerOpenBrace = source.indexOf("{", openBrace + 1);
    if (innerOpenBrace === -1) continue;

    // Find matching close brace
    let depth = 1;
    let closePos = innerOpenBrace + 1;
    while (closePos < source.length && depth > 0) {
      if (source[closePos] === "{") depth++;
      else if (source[closePos] === "}") depth--;
      closePos++;
    }
    closePos--; // points at the closing }

    const objectContent = source.slice(innerOpenBrace + 1, closePos);
    const declarations = parseJsStyleObject(objectContent);

    if (Object.keys(declarations).length > 0) {
      blocks.push({
        source: filePath,
        line: indexToLine(innerOpenBrace),
        declarations,
      });
    }
  }

  return blocks;
}

/**
 * Parse a JS/TS object literal body (between braces) into CSS-style declarations.
 * Converts camelCase JS props to CSS hyphen-case.
 * Only extracts string literal values.
 */
function parseJsStyleObject(content: string): Record<string, string> {
  const r: Record<string, string> = {};

  // Match: propName: "value" or propName: 'value'
  const propRe = /([\w]+)\s*:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;

  while ((m = propRe.exec(content)) !== null) {
    const jsProp = m[1];
    const val = m[2];
    if (!jsProp || !val) continue;
    // Convert camelCase to kebab-case
    const cssProp = jsProp.replace(/([A-Z])/g, "-$1").toLowerCase();
    r[cssProp] = val;
  }

  return r;
}

/**
 * Determine whether a declaration block represents large text.
 * Large text per WCAG: font-size ≥ 24px, or font-size ≥ 18.66px with font-weight ≥ 700.
 */
function isLargeText(declarations: Record<string, string>): boolean {
  const fontSizeStr = declarations["font-size"] ?? declarations["fontsize"];
  if (!fontSizeStr) return false;

  const fontSizePx = parsePxValue(fontSizeStr);
  if (fontSizePx === null) return false;

  if (fontSizePx >= 24) return true;

  if (fontSizePx >= 18.66) {
    const weightStr = declarations["font-weight"] ?? declarations["fontweight"];
    if (!weightStr) return false;
    const weight = parseFloat(weightStr);
    if (!Number.isNaN(weight) && weight >= 700) return true;
    // Named bold keywords
    if (weightStr.trim().toLowerCase() === "bold") return true;
  }

  return false;
}

function parsePxValue(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (!v.endsWith("px")) return null;
  const n = parseFloat(v);
  if (Number.isNaN(n)) return null;
  return n;
}

/**
 * Check a single declaration block for contrast violations.
 */
function checkBlock(
  block: DeclarationBlock,
  ctx: RuleContext,
  findings: Finding[],
  opportunitiesRef: { count: number },
): void {
  const { declarations, source: filePath, line } = block;

  // Find foreground: `color` property
  const fgRaw = declarations["color"];
  if (!fgRaw) return;

  // Find background: prefer `background-color`, fall back to `background` if solid
  let bgRaw: string | undefined;
  if (declarations["background-color"]) {
    bgRaw = declarations["background-color"];
  } else if (declarations["background"]) {
    const bg = declarations["background"];
    if (!isSolidBackground(bg)) return;
    bgRaw = bg;
  }

  if (!bgRaw) return;

  // Resolve both sides
  const fgResolved = resolveColor(fgRaw, ctx);
  const bgResolved = resolveColor(bgRaw, ctx);

  // Skip if either side is unresolvable
  if (fgResolved === null || bgResolved === null) return;

  // Count this pair as an opportunity (both sides resolvable)
  opportunitiesRef.count++;

  // Compute contrast ratio (returns null if alpha < 1 or unparseable)
  const ratio = contrastRatio(fgResolved, bgResolved);
  if (ratio === null) return;

  // Determine threshold
  const threshold = isLargeText(declarations) ? 3.0 : 4.5;

  if (ratio < threshold) {
    findings.push({
      ruleId: RULE_ID,
      axis: "a11y",
      severity: "warning",
      location: { file: filePath, line, column: 1 },
      message: `Contrast ${ratio.toFixed(2)} for ${fgResolved} on ${bgResolved} is below WCAG AA ${threshold}:1`,
      suggestion: `Use a foreground/background pair that achieves at least ${threshold}:1 contrast ratio`,
    });
  }
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  const opportunitiesRef = { count: 0 };

  // Process CSS files
  for (const f of files.css) {
    if (f.skipped) continue;
    const blocks = extractCssBlocks(f.source, f.path);
    for (const block of blocks) {
      checkBlock(block, ctx, findings, opportunitiesRef);
    }
  }

  // Process CSS-in-JS blocks
  for (const b of files.cssInJs) {
    // CSS-in-JS content is a flat declaration string (no { } wrappers)
    const declarations = parseDeclarations(b.content);
    if (Object.keys(declarations).length > 0) {
      const block: DeclarationBlock = {
        source: b.path,
        line: b.line,
        declarations,
      };
      checkBlock(block, ctx, findings, opportunitiesRef);
    }
  }

  // Process inline styles in TypeScript files
  for (const f of files.ts) {
    const blocks = extractInlineStyleBlocks(f.source, f.path);
    for (const block of blocks) {
      checkBlock(block, ctx, findings, opportunitiesRef);
    }
  }

  return { findings, opportunities: opportunitiesRef.count };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Static WCAG-AA contrast check on co-applied foreground/background color pairs",
    fullDescription:
      "For each CSS rule, CSS-in-JS block, or inline `style` object that declares BOTH a foreground (`color`) AND a solid background (`background-color` or a solid `background` shorthand), checks WCAG 2.x contrast on literal color values. Emits a warning when the contrast ratio falls below 4.5:1 (normal text) or 3.0:1 (large text: `font-size` ≥ 24px, or ≥ 18.66px with `font-weight` ≥ 700). Skips when: only one of color/background is present; either side is `transparent`, `currentColor`, or `inherit`; the background is a gradient, `url()`, or multi-layer; either value uses `var()` (the DTCG forward map is not available in RuleContext — token-reference pairs are not yet checked); or `contrastRatio` returns null (alpha channel present). Experimental / off-score — not yet calibrated on real repos.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-contrast-tokens.md",
    rationale: `Why it matters

Insufficient text contrast is one of the most common WCAG 2.1 SC 1.4.3 failures (AA level). Design system tokens are the right place to enforce it: a DS that ships a co-applied color pair below threshold silently propagates that failure to every product built on it.

This rule operates statically — it inspects literal color pairs declared together in the same CSS rule, CSS-in-JS block, or inline style object. \`var()\` references are skipped: the DTCG forward map (token path → resolved value) is not available in RuleContext, so token-reference pairs are not yet checked.

Skips are aggressive: any ambiguity (var(), alpha, gradient, multi-layer background) → no verdict. The rule never guesses.`,
    examples: [
      {
        good: ".btn { color: var(--color-fg); background: var(--color-bg-action); } /* 7.5:1 */",
        bad: ".btn { color: #999999; background: #ffffff; } /* 2.85:1 — fails AA */",
      },
      {
        good: ".heading { color: #111111; background: #ffffff; font-size: 24px; } /* 18.9:1 */",
        bad: ".caption { color: #aaaaaa; background: #ffffff; } /* 2.32:1 — fails AA */",
      },
    ],
    allowlist: [
      "rules where only one of color/background is declared (can't check without both)",
      "var() references that can't be resolved via the project's DTCG token map",
      "backgrounds with alpha, gradients, url(), or multi-layer values",
      "color: transparent / currentColor / inherit (not concrete colors)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
