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

const RULE_ID = "components/doc-comments";
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
// HOC wrappers that still produce a component: `forwardRef`, `memo`, `observer`,
// `styled(...)` — matched by the callee's terminal identifier (so both
// `forwardRef(...)` and `React.forwardRef(...)` resolve).
const COMPONENT_WRAPPERS = new Set(["forwardRef", "memo", "observer", "styled"]);

interface DocFinding {
  componentName: string;
  documented: boolean;
  line: number;
  column: number;
}

function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name);
}

function calleeName(callee: t.Node): string | null {
  if (callee.type === "Identifier") return (callee as t.Identifier).name;
  if (callee.type === "MemberExpression") {
    const prop = (callee as t.MemberExpression).property;
    if (prop.type === "Identifier") return (prop as t.Identifier).name;
  }
  return null;
}

function initIsComponent(init: t.Node | null | undefined): boolean {
  if (!init) return false;
  if (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") return true;
  if (init.type === "CallExpression") {
    const name = calleeName((init as t.CallExpression).callee);
    return name !== null && COMPONENT_WRAPPERS.has(name);
  }
  return false;
}

// True when any node carries a leading JSDoc block — a CommentBlock whose
// value starts with `*` (i.e. the source used the `/**` opener).
function hasJsDoc(...nodes: (t.Node | null | undefined)[]): boolean {
  for (const node of nodes) {
    const comments = node?.leadingComments;
    if (!comments) continue;
    for (const c of comments) {
      if (c.type === "CommentBlock" && c.value.startsWith("*")) return true;
    }
  }
  return false;
}

/**
 * Walk a parsed .tsx/.jsx source for exported PascalCase component declarations
 * (function, arrow/function const, HOC-wrapped const, default function) and
 * record, per component, whether it carries a leading JSDoc doc-comment.
 */
export function scanComponentDocs(source: string): DocFinding[] {
  const found: DocFinding[] = [];
  let ast: t.File;
  try {
    ast = parseBabel(source, { sourceType: "module", plugins: ["typescript", "jsx"], errorRecovery: true });
  } catch {
    return found;
  }

  const record = (name: string, node: t.Node, ...docCandidates: (t.Node | null | undefined)[]): void => {
    const loc = node.loc?.start ?? { line: 1, column: 1 };
    found.push({ componentName: name, documented: hasJsDoc(...docCandidates), line: loc.line, column: loc.column });
  };

  try {
    traverse(ast, {
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (!decl) return;
        if (decl.type === "FunctionDeclaration") {
          const id = decl.id;
          if (id && isPascalCase(id.name)) record(id.name, path.node, path.node, decl);
        } else if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id.type !== "Identifier") continue;
            const name = (d.id as t.Identifier).name;
            if (!isPascalCase(name)) continue;
            if (!initIsComponent(d.init)) continue;
            record(name, path.node, path.node, decl, d);
          }
        }
      },
      ExportDefaultDeclaration(path) {
        const decl = path.node.declaration;
        if (decl.type === "FunctionDeclaration") {
          const id = (decl as t.FunctionDeclaration).id;
          const name = id?.name ?? null;
          if (name && isPascalCase(name)) record(name, path.node, path.node, decl);
        }
      },
    });
  } catch {
    return found;
  }

  return found;
}

const evaluate = async (ctx: RuleContext, files: ParsedFiles): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (!/\.(tsx|jsx)$/.test(f.path)) continue;
    if (isLowSignalValueFile(f.path)) continue;
    if (!/\bexport\b/.test(f.source)) continue;

    for (const c of scanComponentDocs(f.source)) {
      opportunities++;
      if (c.documented) continue;
      findings.push({
        ruleId: RULE_ID,
        axis: "components",
        severity: "info",
        location: { file: f.path, line: c.line, column: c.column },
        message: `Exported component <${c.componentName}> has no doc comment — IDE tooltips and AI agents get no usage guidance`,
        suggestion: `add a JSDoc block (/** … */) above ${c.componentName} describing what it is and when to use it`,
      });
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: RULE_ID,
    defaultSeverity: "info",
    shortDescription: "Exported components should carry a doc comment",
    fullDescription:
      "Scans exported PascalCase components in .tsx/.jsx files (function declarations, arrow/function consts, HOC-wrapped consts via forwardRef/memo/observer/styled, and default-exported functions) and flags those with no leading JSDoc (`/** … */`) doc comment. Presence only — the quality of the prose is out of scope for the static engine. Non-component PascalCase exports (context objects, plain objects, `createContext(...)`), non-Pascal exports (hooks, constants), re-exports, and non-.tsx/.jsx files are not scanned.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-doc-comments.md",
    rationale: `Why it matters

A design system's components are its public API. A JSDoc doc comment on an exported component is what surfaces in IDE tooltips, what TypeDoc renders, and what AI coding agents read to decide whether and how to use the component. An undocumented export forces every consumer to read the source. The check is presence-only: a one-line \`/** A button. */\` clears it — judging the prose is the LLM layer's job, not the static engine's.

The rule is experimental and does not contribute to the health score until calibration data is available.`,
    examples: [
      {
        good: "/** Primary action button. */\nexport function Button() { return <button />; }",
        bad: "export function Button() { return <button />; }",
      },
    ],
    allowlist: [
      "non-component PascalCase exports (objects, `createContext(...)`, theme constants)",
      "non-Pascal exports (hooks, SCREAMING_CASE constants)",
      "re-exports (`export { Button } from './Button'`)",
      "test / story / fixture files",
      "inline `// lyse-disable-next-line components/doc-comments` directive",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  scanComponentDocs,
  COMPONENT_WRAPPERS,
};
