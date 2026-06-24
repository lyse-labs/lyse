import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { createLyseRule } from "./_rule-module.js";

const RULE_ID = "a11y/focus-visible";
const MAX_FILE_BYTES = 1_000_000;

const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// `outline: none` / `outline: 0` / `outline: 0px` / `outline-width: 0` — the
// classic focus-indicator kill switch.
const RE_OUTLINE_SUPPRESSED = /outline(?:-width)?\s*:\s*(?:none|0(?:px|em|rem)?)\b/i;
// Any sign the design system has adopted focus-visible: the CSS pseudo-class,
// or the `focus-visible` polyfill (npm import / `.js-focus-visible` /
// `[data-focus-visible-added]`). A single substring match covers all of them.
const RE_FOCUS_VISIBLE = /focus-visible/i;

function suppressesOutline(src: string): boolean {
  return RE_OUTLINE_SUPPRESSED.test(src);
}

function hasFocusVisible(src: string): boolean {
  return RE_FOCUS_VISIBLE.test(src);
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

  const suppressed =
    files.css.some((f) => !f.skipped && suppressesOutline(f.source)) ||
    files.cssInJs.some((b) => suppressesOutline(b.content));

  if (!suppressed) return { findings, opportunities: 0 };

  const adoptsFocusVisible =
    files.css.some((f) => !f.skipped && hasFocusVisible(f.source)) ||
    files.cssInJs.some((b) => hasFocusVisible(b.content)) ||
    files.ts.some((f) => hasFocusVisible(f.source));

  if (adoptsFocusVisible) return { findings, opportunities: 1 };

  findings.push({
    ruleId: RULE_ID,
    axis: "a11y",
    severity: "warning",
    location: { file: ".", line: 1, column: 1 },
    message:
      "Focus outline is removed (`outline: none`) but the design system never adopts `:focus-visible` — keyboard users may lose the focus indicator",
    suggestion:
      "scope outline removal to `:focus:not(:focus-visible)` and provide a visible `:focus-visible` style (or adopt the `focus-visible` polyfill)",
  });
  return { findings, opportunities: 1 };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Removing the focus outline requires `:focus-visible` adoption",
    fullDescription:
      "Checks, at repo level, whether a design system that suppresses the focus outline (`outline: none` / `outline: 0`, in CSS or CSS-in-JS) also adopts `:focus-visible` somewhere — the CSS pseudo-class, or the `focus-visible` polyfill (npm import, `.js-focus-visible` class, or `[data-focus-visible-added]`). Emits one warning when an outline is removed but no `:focus-visible` adoption is found anywhere. Emits nothing when `:focus-visible` is adopted or when no outline is suppressed (N/A). The modern `:focus:not(:focus-visible) { outline: none }` pattern is correct and clears the check because `:focus-visible` is present.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-focus-visible.md",
    rationale: `Why it matters

A visible focus indicator is how keyboard and switch users know where they are. Blanket \`outline: none\` resets — extremely common in design-system base styles — silently delete that indicator for every product downstream. \`:focus-visible\` is the modern fix: it lets you remove the outline for mouse users while keeping it for keyboard users.

The check is repo-level and conservative: it only fires when an outline is explicitly removed AND no \`:focus-visible\` adoption exists anywhere.`,
    examples: [
      {
        good: "button:focus:not(:focus-visible) { outline: none; }\nbutton:focus-visible { outline: 2px solid; }",
        bad: "button:focus { outline: none; }",
      },
    ],
    allowlist: [
      "repos containing `lyse-disable a11y/focus-visible` in a README — rule is N/A",
      "design systems that never remove the focus outline — the check does not apply (N/A)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  suppressesOutline,
  hasFocusVisible,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
