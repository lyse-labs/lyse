import { parse as parseBabel } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import type {
  Rule,
  RuleContext,
  ParsedFiles,
  RuleEvalResult,
  Finding,
} from "../types.js";
import { createLyseRule } from "./_rule-module.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;

// Mutually-exclusive visual-variant names. A component declaring >=2 of these
// as boolean props has a "boolean explosion" — they should be one `variant`
// union. Allowlist (not denylist): generic state booleans (disabled, loading,
// fullWidth, …) are absent on purpose, so they never match.
const STYLE_MODIFIER_VOCAB = new Set([
  "primary", "secondary", "tertiary", "danger", "destructive", "success",
  "warning", "info", "ghost", "outline", "outlined", "link", "solid",
  "subtle", "plain", "neutral", "accent", "filled", "muted",
]);

function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name);
}

function booleanStyleProps(members: t.TSTypeElement[]): string[] {
  const hits: string[] = [];
  for (const member of members) {
    if (member.type !== "TSPropertySignature") continue;
    const sig = member as t.TSPropertySignature;
    if (sig.key.type !== "Identifier") continue;
    const name = (sig.key as t.Identifier).name;
    if (!STYLE_MODIFIER_VOCAB.has(name.toLowerCase())) continue;
    const ann = sig.typeAnnotation?.typeAnnotation;
    if (!ann || ann.type !== "TSBooleanKeyword") continue;
    hits.push(name);
  }
  return hits;
}

interface VariantFinding {
  componentName: string;
  props: string[];
  line: number;
  column: number;
}

export function scanBooleanVariants(
  source: string,
): { findings: VariantFinding[]; componentCount: number } {
  const findings: VariantFinding[] = [];
  let ast: t.File;
  try {
    ast = parseBabel(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return { findings, componentCount: 0 };
  }

  const typeDeclarations = new Map<string, t.TSTypeElement[]>();
  try {
    traverse(ast, {
      TSInterfaceDeclaration(path) {
        typeDeclarations.set(path.node.id.name, path.node.body.body);
      },
      TSTypeAliasDeclaration(path) {
        const ann = path.node.typeAnnotation;
        if (ann.type === "TSTypeLiteral") {
          typeDeclarations.set(path.node.id.name, (ann as t.TSTypeLiteral).members);
        }
      },
    });
  } catch {
    return { findings, componentCount: 0 };
  }

  let componentCount = 0;

  const resolveAndCollect = (
    componentName: string,
    params: t.Node[],
    loc: { line: number; column: number },
  ): void => {
    if (params.length === 0) return;
    const first = params[0]!;
    let typeAnnotation: t.TSType | undefined;
    if (
      first.type === "Identifier" &&
      (first as t.Identifier).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = ((first as t.Identifier).typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
    } else if (
      first.type === "ObjectPattern" &&
      (first as t.ObjectPattern).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = ((first as t.ObjectPattern).typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
    }
    if (!typeAnnotation) return;

    componentCount++;

    let members: t.TSTypeElement[] | undefined;
    if (typeAnnotation.type === "TSTypeLiteral") {
      members = (typeAnnotation as t.TSTypeLiteral).members;
    } else if (typeAnnotation.type === "TSTypeReference") {
      const ref = typeAnnotation as t.TSTypeReference;
      if (ref.typeName.type === "Identifier") {
        members = typeDeclarations.get((ref.typeName as t.Identifier).name);
      }
    }
    if (!members) return;

    const props = booleanStyleProps(members);
    if (props.length >= 2) {
      findings.push({ componentName, props, line: loc.line, column: loc.column });
    }
  };

  try {
    traverse(ast, {
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        if (!decl) return;
        if (decl.type === "FunctionDeclaration") {
          const id = decl.id;
          if (id && isPascalCase(id.name)) {
            const loc = decl.loc?.start ?? { line: 1, column: 0 };
            resolveAndCollect(id.name, decl.params, loc);
          }
        } else if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id.type !== "Identifier") continue;
            const name = (d.id as t.Identifier).name;
            if (!isPascalCase(name)) continue;
            const init = d.init;
            const loc = d.loc?.start ?? { line: 1, column: 0 };
            if (init && init.type === "ArrowFunctionExpression") {
              resolveAndCollect(name, (init as t.ArrowFunctionExpression).params, loc);
            } else if (init && init.type === "FunctionExpression") {
              resolveAndCollect(name, (init as t.FunctionExpression).params, loc);
            }
          }
        }
      },
      ExportDefaultDeclaration(path) {
        const decl = path.node.declaration;
        if (decl.type === "FunctionDeclaration") {
          const fn = decl as t.FunctionDeclaration;
          const name = fn.id?.name ?? "default";
          if (isPascalCase(name)) {
            const loc = fn.loc?.start ?? { line: 1, column: 0 };
            resolveAndCollect(name, fn.params, loc);
          }
        }
      },
    });
  } catch {
    return { findings, componentCount };
  }

  return { findings, componentCount };
}

const evaluate = async (
  _ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;
  for (const f of files.ts) {
    if (!/\bexport\b/.test(f.source)) continue;
    const { findings: vf, componentCount } = scanBooleanVariants(f.source);
    opportunities += componentCount;
    for (const v of vf) {
      findings.push({
        ruleId: "components/standardized-variant-props",
        axis: "components",
        severity: "warning",
        location: { file: f.path, line: v.line, column: v.column },
        message: `Component <${v.componentName}> encodes variants as separate boolean props (${v.props.join(", ")}) — use a single \`variant\` union`,
        suggestion: `replace the boolean flags with \`variant?: ${v.props.map((p) => `"${p}"`).join(" | ")}\``,
      });
    }
  }
  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: "components/standardized-variant-props",
    defaultSeverity: "warning",
    shortDescription: "Variants encoded as separate boolean props",
    fullDescription:
      "Flags an exported PascalCase component that declares two or more mutually-exclusive visual-variant flags (primary, secondary, danger, ghost, outline, …) as separate `boolean` props — the 'boolean explosion' antipattern. Such props permit nonsensical combinations (`<Button primary danger>`) and give an AI agent no enumerable vocabulary; the standard is a single `variant` string-literal union. Only names in a curated style-modifier vocabulary, typed `boolean`, count — generic state booleans (`disabled`, `loading`, `fullWidth`, …) are never matched. Orthogonal to `components/contracts-strictness`, which checks the type of an existing `variant` prop.",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-standardized-variant-props.md",
    rationale: `Why it matters

A component with \`primary\`, \`secondary\`, and \`danger\` boolean props lets a caller set several at once and offers an AI agent no closed set of valid values. One \`variant\` union (\`"primary" | "secondary" | "danger"\`) is mutually exclusive by construction and self-documenting.

A single style boolean (e.g. just \`primary\`) is a common, acceptable shorthand, so the rule fires only at two or more.

Experimental and unmeasured: real-world precision is pending a harvest measurement; the rule does not contribute to the Health Score.`,
    examples: [
      {
        good: `interface ButtonProps { variant?: "primary" | "secondary" | "danger"; disabled?: boolean }`,
        bad: `interface ButtonProps { primary?: boolean; secondary?: boolean; danger?: boolean }`,
      },
    ],
    allowlist: [
      "generic state booleans (disabled, loading, active, selected, fullWidth, rounded, …) — not in the style-modifier vocabulary",
      "a single style-modifier boolean (below the >=2 threshold)",
      "style-modifier names that are not typed `boolean`",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});
