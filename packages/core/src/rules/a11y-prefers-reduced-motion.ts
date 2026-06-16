import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "a11y/prefers-reduced-motion";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

const RE_GUARD = /prefers-reduced-motion/i;
const RE_KEYFRAMES = /@keyframes\s+[\w-]/i;
// `transition` / `animation` (incl. common longhands) with a value.
const RE_MOTION_DECL = /\b(?:transition|animation)(?:-(?:property|name|duration|delay))?\s*:\s*([^;}{]+)/gi;
// Values that mean "no motion" — a declaration with only these does not count.
const RE_NOOP_VALUE = /^(?:none|unset|initial|inherit|revert|0s|0ms|0)$/i;

function usesMotionInText(src: string): boolean {
  if (RE_KEYFRAMES.test(src)) return true;
  RE_MOTION_DECL.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_MOTION_DECL.exec(src)) !== null) {
    const value = m[1]!.trim().toLowerCase();
    if (value.length > 0 && !RE_NOOP_VALUE.test(value)) return true;
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

  // Motion is only counted from CSS sources (real CSS + extracted CSS-in-JS),
  // not from TS — a `transition` prop on a framer-motion component is not a CSS
  // animation and would over-fire. The guard, however, is honored from anywhere
  // (a CSS media query OR a JS `matchMedia('(prefers-reduced-motion...)')`).
  const usesMotion =
    files.css.some((f) => !f.skipped && usesMotionInText(f.source)) ||
    files.cssInJs.some((b) => usesMotionInText(b.content));

  if (!usesMotion) return { findings, opportunities: 0 };

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
      "Design system uses transitions/animations but defines no `prefers-reduced-motion` guard — users who request reduced motion still get the full animations",
    suggestion:
      "add a `@media (prefers-reduced-motion: reduce)` block that disables or shortens motion (or gate motion behind `prefers-reduced-motion: no-preference`)",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Animated design systems should honor `prefers-reduced-motion`",
    fullDescription:
      "Checks, at repo level, whether a design system that uses CSS transitions, animations, or `@keyframes` also ships a `prefers-reduced-motion` guard — either a `@media (prefers-reduced-motion: …)` block in CSS / CSS-in-JS, or a `matchMedia('(prefers-reduced-motion: …)')` call in JS/TS. Emits one warning when motion is present but no guard is found anywhere. Emits nothing when a guard exists or when the design system uses no motion (N/A). Motion is detected only from CSS sources (CSS files + extracted CSS-in-JS), not from TS, to avoid mistaking a framer-motion `transition` prop for a CSS animation.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-prefers-reduced-motion.md",
    rationale: `Why it matters

Vestibular and motion-sensitivity disorders make large or fast animations actively harmful — they can trigger nausea, dizziness, and migraines. The \`prefers-reduced-motion\` media feature lets users opt out at the OS level; a design system that animates without honoring it ignores that signal for every product built on it.

The check is repo-level and broad: a single guard anywhere (CSS media query or JS \`matchMedia\`) is enough to clear it. The rule is experimental and does not contribute to the health score until calibration data is available.`,
    examples: [
      {
        good: ".btn { transition: transform .2s; }\n@media (prefers-reduced-motion: reduce) { .btn { transition: none; } }",
        bad: ".btn { transition: transform .2s; }",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable a11y/prefers-reduced-motion` in a README — rule is N/A",
      "design systems that use no CSS motion at all — the check does not apply (N/A)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  usesMotionInText,
  hasGuardInText,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
