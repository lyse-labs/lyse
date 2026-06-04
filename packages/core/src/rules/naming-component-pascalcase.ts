import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
  ClassifyContext,
  Confidence,
  CodemodContext,
  CodemodResult,
} from "../types.js";
import { isPathExcluded } from "./_exclude.js";
import { fixNamingComponentPascalCase } from "../codemods/naming-component-pascalcase.js";
import { adaptOldCodemodResult } from "./_codemod-adapter.js";
import { createLyseRule } from "./_rule-module.js";
import {
  arrowImplicitReturnsJsx,
  bodyReturnsJsx,
  extractFunctionBody,
} from "./_function-body-analysis.js";

// ---------------------------------------------------------------------------
// PascalCase check
// ---------------------------------------------------------------------------
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name);
}

// Known HOC prefixes to skip
const HOC_NAME_RE = /^with[A-Z]/;

// ---------------------------------------------------------------------------
// Compliance counter
// ---------------------------------------------------------------------------
// Counts PascalCase exported components (correct pattern)
const EXPORTED_PASCAL_COMPONENT_RE = /\bexport\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][a-zA-Z0-9]*)\b/g;

/**
 * Counts how many exported PascalCase component names exist in the source.
 * These are compliant usages (denominator for scoring).
 */
export function countCompliantComponents(source: string): number {
  EXPORTED_PASCAL_COMPONENT_RE.lastIndex = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPORTED_PASCAL_COMPONENT_RE.exec(source)) !== null) {
    if (m[1] && isPascalCase(m[1])) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Exported name extraction — finds exported function/const names that look
// like React components (return JSX or have displayName)
// ---------------------------------------------------------------------------
// Matches: export function myName(...), export const myName = ..., export default function myName(...)
const EXPORT_FUNC_RE =
  /\bexport\s+(?:default\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()/g;

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

/**
 * Extract candidate component names from a source file that are exported
 * but NOT PascalCase.
 *
 * Detection heuristics:
 * 1. Find exported named functions or arrow function consts
 * 2. Check if the body contains JSX return (return <...) as component signal
 * 3. Skip HOC patterns (withXxx)
 * 4. Skip hook patterns (useXxx) — handled by naming/hook-prefix rule
 * 5. Skip test utilities
 */
function detectNonPascalComponents(
  source: string,
  path: string,
): Array<{ name: string; index: number }> {
  const results: Array<{ name: string; index: number }> = [];
  // Skip test files
  if (/\.(test|spec)\.(tsx?|jsx?)$/.test(path)) return results;

  EXPORT_FUNC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = EXPORT_FUNC_RE.exec(source)) !== null) {
    const name = m[1] ?? m[2];
    if (!name) continue;
    // Skip already-PascalCase (correct)
    if (isPascalCase(name)) continue;
    // Skip HOCs
    if (HOC_NAME_RE.test(name)) continue;
    // Skip hooks (handled by hook-prefix rule)
    if (/^use[A-Z]/.test(name)) continue;
    const isConstArrow = m[2] !== undefined;
    const bodySlice = extractFunctionBody(source, m.index);
    const hasJsxReturn =
      bodyReturnsJsx(bodySlice) ||
      (isConstArrow && arrowImplicitReturnsJsx(source, m.index));
    const hasDisplayName = new RegExp(`${name}\\.displayName\\s*=`).test(source);
    if (!hasJsxReturn && !hasDisplayName) continue;

    results.push({ name, index: m.index });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Compliance counter for evaluate
// ---------------------------------------------------------------------------
function toPascalCase(name: string): string {
  // Simple converter: split on _, - or camelCase boundaries
  // For camelCase: myComponent → MyComponent
  // For snake_case: my_component → MyComponent
  // For kebab-case: my-component → MyComponent
  const parts = name
    .replace(/[-_]/g, " ")
    // Insert space before uppercase letters in camelCase
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(/\s+/);
  return parts
    .map((p) => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : ""))
    .join("");
}

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    // Only scan JSX/TSX files (component files)
    if (!/\.(tsx|jsx)$/.test(f.path)) continue;
    // Skip test/spec files
    if (/\.(test|spec)\.(tsx?|jsx?)$/.test(f.path)) continue;

    opportunities += countCompliantComponents(f.source);

    const hits = detectNonPascalComponents(f.source, f.path);
    for (const h of hits) {
      opportunities++;
      const loc = locationFromIndex(f.source, h.index);
      const suggested = toPascalCase(h.name);
      findings.push({
        ruleId: "naming/component-pascalcase",
        axis: "components",
        severity: "warning",
        location: { file: f.path, line: loc.line, column: loc.column },
        message: `Component '${h.name}' is not PascalCase`,
        suggestion: `Rename to '${suggested}'`,
      });
    }
  }

  return { findings, opportunities };
};

const classifyConfidence: NonNullable<Rule["classifyConfidence"]> = (
  finding: Finding,
  _ctx: ClassifyContext,
): Confidence => {
  const nameMatch = finding.message.match(/Component '(\w+)'/);
  const name = nameMatch?.[1] ?? "";
  if (!name) return "low";
  // Simple renames (camelCase → PascalCase) are high confidence
  // snake_case or kebab-case in name means more complex rename → medium
  if (name.includes("_") || name.includes("-")) return "medium";
  // If it starts with a lowercase letter but is otherwise simple camelCase
  return "high";
};

const applyCodemod: NonNullable<Rule["applyCodemod"]> = (
  finding: Finding,
  ctx: CodemodContext,
): CodemodResult => {
  const ruleCtx: RuleContext = {
    repoRoot: "",
    tokens: ctx.tokens,
    componentsModule: ctx.config.designSystem?.componentsModule ?? null,
    componentInventory: [],
    storyIndex: null,
    excludePaths: [],
  };
  const oldResult = fixNamingComponentPascalCase({
    source: ctx.fileContent,
    path: finding.location.file,
    finding,
    ctx: ruleCtx,
  });
  return adaptOldCodemodResult(oldResult);
};

export const rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: "naming/component-pascalcase",
    defaultSeverity: "warning",
    shortDescription: "Exported React/Vue/Solid components must be PascalCase",
    fullDescription:
      "Exported component functions or const arrow-function components (those returning JSX) that are not named in PascalCase violate React/Vue/Solid component naming conventions. Non-PascalCase names are silently treated as plain elements in JSX, causing components to render as unknown DOM elements and breaking the React component model.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/naming-component-pascalcase.md",
    rationale: `Why it matters

React, Vue, and Solid distinguish between HTML element types and component types by case: \`<myButton>\` creates an unknown HTML element whereas \`<MyButton>\` invokes the component. A component named \`myButton\` instead of \`MyButton\` is silently broken when used as JSX — it renders nothing useful.

Auto-fix renames the declaration and internal same-file references. Cross-file imports must be updated separately (the suggestion includes a warning when the name is exported).`,
    examples: [
      { good: "export function MyButton() { return <button>Click</button>; }", bad: "export function myButton() { return <button>Click</button>; }" },
      { good: "export const MyCard = () => <div className=\"card\" />;", bad: "export const my_card = () => <div className=\"card\" />;" },
    ],
    allowlist: ["HOC patterns (withRouter, withTheme — start with `with` lowercase)", "test utilities in .test.tsx / .spec.tsx files", "hooks starting with `use` (handled by naming/hook-prefix)"],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
  classifyConfidence,
  applyCodemod,
});
