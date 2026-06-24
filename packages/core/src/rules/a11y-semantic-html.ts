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

const RULE_ID = "a11y/semantic-html";
const MAX_FILE_BYTES = 2_000_000;
const DISABLE_DIRECTIVE = `lyse-disable ${RULE_ID}`;
const README_CANDIDATES = ["README.md", "README", "readme.md", "README.mdx"];

// Click-style handlers that make an element interactive.
const INTERACTIVE_HANDLERS = new Set(["onClick", "onMouseDown", "onMouseUp"]);
// Native elements that are ALREADY interactive — a handler on them is fine.
const NATIVE_INTERACTIVE = new Set(["button", "a", "input", "select", "textarea", "option", "details", "summary"]);

interface StaticInteractiveHit {
  tag: string;
  line: number;
  column: number;
}

/**
 * Walk JSX once for lowercase (native) elements that carry a click handler.
 * Returns the offenders (handler + no role) and the total count of static
 * interactive elements (the scored denominator). Custom PascalCase components
 * are skipped (the handler is a prop, not a DOM element). An element with a
 * spread (`{...props}`) is skipped entirely — `role` may be forwarded through
 * the spread, invisible to the AST, so flagging it would be a false positive.
 */
export function scanStaticInteractive(source: string): { offenders: StaticInteractiveHit[]; total: number } {
  const offenders: StaticInteractiveHit[] = [];
  let total = 0;
  let ast: t.File;
  try {
    ast = parseBabel(source, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  } catch {
    return { offenders, total };
  }

  const visit = (opening: t.JSXOpeningElement): void => {
    const nameNode = opening.name;
    if (nameNode.type !== "JSXIdentifier") return;
    const tag = nameNode.name;
    // Only native lowercase elements; PascalCase = component (handler is a prop).
    if (!/^[a-z]/.test(tag)) return;
    if (NATIVE_INTERACTIVE.has(tag)) return;

    let hasHandler = false;
    let hasRole = false;
    let hasSpread = false;
    for (const attr of opening.attributes) {
      if (attr.type === "JSXSpreadAttribute") { hasSpread = true; continue; }
      if (attr.name.type !== "JSXIdentifier") continue;
      const an = attr.name.name;
      if (INTERACTIVE_HANDLERS.has(an)) hasHandler = true;
      if (an === "role") hasRole = true;
    }
    if (!hasHandler) return;
    // A spread may forward `role` — can't prove it's missing, so don't flag or
    // count (avoids both a false positive and a skewed denominator).
    if (hasSpread) return;
    total++;
    if (!hasRole) {
      const loc = opening.loc?.start ?? { line: 1, column: 0 };
      offenders.push({ tag, line: loc.line, column: loc.column + 1 });
    }
  };

  try {
    traverse(ast, {
      JSXOpeningElement(path) { visit(path.node); },
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
    const { offenders, total } = scanStaticInteractive(f.source);
    opportunities += total;
    for (const h of offenders) {
      findings.push({
        ruleId: RULE_ID,
        axis: "a11y",
        severity: "warning",
        location: { file: f.path, line: h.line, column: h.column },
        message: `<${h.tag}> has a click handler but no role — keyboard and screen-reader users can't operate it (use <button>, or add role + tabIndex + a key handler)`,
        suggestion: `replace <${h.tag} onClick> with a <button>, or add role="button" tabIndex={0} and an onKeyDown handler`,
      });
    }
  }
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "a11y",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Interactive handlers belong on semantic elements",
    fullDescription:
      "Flags native lowercase elements (`div`, `span`, `li`, `section`, …) that carry a click handler (`onClick` / `onMouseDown` / `onMouseUp`) but no `role` attribute — the classic `no-static-element-interactions` accessibility bug. Keyboard and screen-reader users cannot operate a clickable `<div>` that has no semantic role. Native interactive elements (`button`, `a`, `input`, …) are exempt, as are custom PascalCase components (where `onClick` is a prop, not a DOM element) and elements that already declare a `role`.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/a11y-semantic-html.md",
    rationale: `Why it matters

A clickable \`<div>\` works for mouse users and no one else: it's not focusable, doesn't fire on Enter/Space, and a screen reader announces nothing actionable. Using the right element — \`<button>\` — gives keyboard operability, focus, and role for free. When a non-semantic element must be interactive, it needs \`role\`, \`tabIndex\`, and a key handler to be equivalent. This rule catches the missing-role case, which is the most common and the most broken.

It is scoped tightly to avoid false positives: only native lowercase elements with a click handler and no role; component props and already-roled elements are left alone.`,
    examples: [
      {
        good: "<button onClick={save}>Save</button>",
        bad: "<div onClick={save}>Save</div>",
      },
    ],
    allowlist: [
      "native interactive elements (`button`, `a`, `input`, `select`, `textarea`, …) — exempt",
      "elements that declare a `role` (the author opted into explicit semantics)",
      "custom PascalCase components — `onClick` is a prop, not a DOM handler",
      "repos containing `lyse-disable a11y/semantic-html` in a README — rule is N/A",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  scanStaticInteractive,
  isAllowlisted,
  DISABLE_DIRECTIVE,
};
