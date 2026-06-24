import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "a11y/forced-colors";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// Color-bearing declarations — the signal that a stylesheet paints UI that a
// forced-colors / high-contrast mode would need to remain legible.
const RE_COLOR_DECL = /\b(?:color|background|background-color|border-color|fill|stroke|box-shadow|outline-color)\s*:\s*([^;}{]+)/gi;
// Values that paint nothing — a declaration with only these does not count.
const RE_NOOP_COLOR = /^(?:none|unset|initial|inherit|revert|transparent|currentcolor)$/i;

// A forced-colors / high-contrast affordance: the `forced-colors` /
// `prefers-contrast` media features, the `forced-color-adjust` property, the
// legacy `-ms-high-contrast` query, or a high-contrast theme selector
// (`.high-contrast`, `.hc`, `[data-theme*="contrast"]`).
const RE_GUARD =
  /forced-colors|forced-color-adjust|prefers-contrast|-ms-high-contrast|\.(?:high-contrast|hc)\b|\[data-[^\]]*contrast/i;

function usesColorInText(src: string): boolean {
  RE_COLOR_DECL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_COLOR_DECL.exec(src)) !== null) {
    const value = m[1]!.trim().toLowerCase();
    if (value.length > 0 && !RE_NOOP_COLOR.test(value)) return true;
  }
  return false;
}

function hasGuardInText(src: string): boolean {
  return RE_GUARD.test(src);
}

function readFileIfSmall(absPath: string): string | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function isAllowlisted(repoRoot: string): boolean {
  for (const candidate of README_CANDIDATES) {
    const abs = join(repoRoot, candidate);
    if (!existsSync(abs)) continue;
    const content = readFileIfSmall(abs);
    if (content !== null && content.includes(DISABLE_DIRECTIVE)) return true;
  }
  return false;
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  if (ctx.repoRoot && isAllowlisted(ctx.repoRoot)) return { findings, opportunities: 0 };

  // Color styling is only counted from CSS sources (real CSS + extracted
  // CSS-in-JS), not from TS, to avoid mistaking a JS color constant for a
  // painted surface. The guard, however, is honored from anywhere (a CSS media
  // query OR a JS `matchMedia('(forced-colors: active)')`).
  const usesColor =
    files.css.some((f) => !f.skipped && usesColorInText(f.source)) ||
    files.cssInJs.some((b) => usesColorInText(b.content));

  if (!usesColor) return { findings, opportunities: 0 };

  const hasGuard =
    files.css.some((f) => !f.skipped && hasGuardInText(f.source)) ||
    files.cssInJs.some((b) => hasGuardInText(b.content)) ||
    files.ts.some((f) => hasGuardInText(f.source));

  if (hasGuard) return { findings, opportunities: 1 };

  findings.push({
    ruleId: RULE_ID,
    axis: "a11y",
    severity: "warning",
    location: { file: ".", line: 1, column: 1 },
    message:
      "Design system paints colors but defines no forced-colors / high-contrast handling — in Windows High Contrast Mode (forced-colors) components may lose borders, focus rings, and meaning conveyed by color",
    suggestion:
      "add a `@media (forced-colors: active)` block (use `forced-color-adjust` and system color keywords for borders/focus), or a `prefers-contrast` / high-contrast token set",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Color design systems should support forced-colors / high-contrast",
    fullDescription:
      "Checks, at repo level, whether a design system that paints colors (color/background/border-color/fill/stroke/box-shadow/outline declarations in CSS or CSS-in-JS) also ships a forced-colors / high-contrast affordance — a `@media (forced-colors: active)` or `@media (prefers-contrast: …)` block, the `forced-color-adjust` property, the legacy `-ms-high-contrast` query, or a high-contrast theme selector (`.high-contrast`, `[data-theme*=\"contrast\"]`). A `matchMedia('(forced-colors: …)')` call in JS/TS also clears it. Emits one warning when color is painted but no affordance is found anywhere; emits nothing when an affordance exists or when the design system paints no colors (N/A).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-forced-colors.md",
    rationale: `Why it matters

Windows High Contrast Mode (surfaced to CSS as \`forced-colors: active\`) replaces the author's palette with a small user-chosen set. Components that lean on background color alone for shape, on box-shadow for elevation, or on color alone to convey state can become invisible or meaningless. The \`forced-colors\` and \`prefers-contrast\` media features — plus \`forced-color-adjust\` and system color keywords — let a design system stay legible for low-vision users who depend on these modes.

The check is repo-level and broad: a single affordance anywhere clears it.`,
    examples: [
      {
        good: ".btn { background: var(--accent); }\n@media (forced-colors: active) { .btn { border: 1px solid ButtonText; } }",
        bad: ".btn { background: var(--accent); box-shadow: 0 1px 2px rgba(0,0,0,.2); }",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable a11y/forced-colors` in a README — rule is N/A",
      "design systems that paint no colors (layout-only CSS) — the check does not apply (N/A)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  usesColorInText,
  hasGuardInText,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
