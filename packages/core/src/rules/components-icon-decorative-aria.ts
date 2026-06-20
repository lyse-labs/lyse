import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseBabel } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import type { Rule, RuleContext, ParsedFiles, RuleEvalResult, Finding } from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { isLowSignalValueFile } from "./_skip-context.js";
import { createLyseRule } from "./_rule-module.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

const RULE_ID = "components/icon-decorative-aria";
const MAX_FILE_BYTES = 2_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// Attributes that give an <svg> an accessible treatment (either hidden from AT,
// or labelled as meaningful). Any of them clears the rule.
const ACCESSIBLE_ATTRS = new Set(["aria-hidden", "role", "aria-label", "aria-labelledby"]);

/**
 * Walk JSX for inline `<svg>` elements that have NO accessible treatment:
 * no aria-hidden / role / aria-label / aria-labelledby attribute AND no
 * `<title>` child. Returns the offenders plus the total svg count (for the
 * scored opportunity denominator).
 */
export function scanBareSvgs(source: string): { offenders: { line: number; column: number }[]; total: number } {
  const offenders: { line: number; column: number }[] = [];
  let total = 0;
  let ast: t.File;
  try {
    ast = parseBabel(source, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  } catch {
    return { offenders, total };
  }

  const hasTitleChild = (el: t.JSXElement): boolean =>
    el.children.some(
      (c) =>
        c.type === "JSXElement" &&
        c.openingElement.name.type === "JSXIdentifier" &&
        c.openingElement.name.name === "title",
    );

  try {
    traverse(ast, {
      JSXElement(path) {
        const opening = path.node.openingElement;
        if (opening.name.type !== "JSXIdentifier" || opening.name.name !== "svg") return;
        total++;
        let accessible = false;
        for (const attr of opening.attributes) {
          // A spread (`{...props}`) may forward aria-hidden / role / aria-label
          // that the AST can't see — treat the svg as accessible (don't flag).
          if (attr.type === "JSXSpreadAttribute") { accessible = true; break; }
          if (attr.type !== "JSXAttribute" || attr.name.type !== "JSXIdentifier") continue;
          if (ACCESSIBLE_ATTRS.has(attr.name.name)) { accessible = true; break; }
        }
        if (!accessible && hasTitleChild(path.node)) accessible = true;
        if (!accessible) {
          const loc = opening.loc?.start ?? { line: 1, column: 0 };
          offenders.push({ line: loc.line, column: loc.column + 1 });
        }
      },
    });
  } catch {
    return { offenders, total };
  }
  return { offenders, total };
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

  let opportunities = 0;
  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (!/\.(tsx|jsx)$/.test(f.path)) continue;
    if (isLowSignalValueFile(f.path)) continue;
    if (!/<svg\b/.test(f.source)) continue;
    const { offenders, total } = scanBareSvgs(f.source);
    opportunities += total;
    for (const o of offenders) {
      findings.push({
        ruleId: RULE_ID,
        axis: "components",
        severity: "warning",
        location: { file: f.path, line: o.line, column: o.column },
        message:
          "Inline <svg> has no accessible treatment — a decorative icon should be `aria-hidden`, and a meaningful one needs `role=\"img\"` + a label",
        suggestion:
          'add `aria-hidden="true"` if the icon is decorative, or `role="img" aria-label="…"` (or a <title> child) if it conveys meaning',
      });
    }
  }
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Inline SVG icons need an accessible treatment",
    fullDescription:
      "Flags inline `<svg>` elements in .tsx/.jsx that have no accessible treatment: no `aria-hidden`, `role`, `aria-label`, or `aria-labelledby` attribute and no `<title>` child. A decorative icon must be hidden from assistive tech (`aria-hidden`), and a meaningful one must be labelled (`role=\"img\"` + `aria-label` / `<title>`). A bare `<svg>` is ambiguous to screen readers — often announced as an unlabeled graphic. Any accessible attribute or a `<title>` child clears it.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-icon-decorative-aria.md",
    rationale: `Why it matters

An icon is either decorative (it repeats adjacent text — should be silent to a screen reader) or meaningful (it stands alone — must be labelled). A bare \`<svg>\` declares neither, so assistive tech guesses: many screen readers announce "graphic" or read raw path data. Marking intent — \`aria-hidden\` for decorative, \`role="img"\` + label for meaningful — is the single most common SVG-accessibility fix.

The rule is conservative: any of \`aria-hidden\` / \`role\` / \`aria-label\` / \`aria-labelledby\` / a \`<title>\` child clears it, so authors who made any accessibility decision are never nagged. It is experimental and does not contribute to the health score until calibration data is available.`,
    examples: [
      {
        good: '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="…" /></svg>',
        bad: '<svg viewBox="0 0 16 16"><path d="…" /></svg>',
      },
    ],
    allowlist: [
      "any `<svg>` with `aria-hidden`, `role`, `aria-label`, or `aria-labelledby`",
      "any `<svg>` with a `<title>` child",
      "repos containing `lyse-disable components/icon-decorative-aria` in a README — rule is N/A",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  scanBareSvgs,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
