import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import fg from "fast-glob";
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
import { isPathExcluded } from "./_exclude.js";
import { createLyseRule } from "./_rule-module.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

const RULE_ID = "components/contracts-strictness";
const MAX_FILE_BYTES = 2_000_000;

const VARIANT_PROP_RE = /^(variant|size|intent|color|tone|appearance|kind)$/i;
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;

const FRAMEWORK_ALLOWED_PROPS = new Set([
  "children",
  "ref",
  "key",
  "asChild",
  "as",
]);

interface ComponentPropFinding {
  componentName: string;
  propName: string;
  kind: "any" | "unknown" | "string-variant";
  line: number;
  column: number;
}

function isPascalCase(name: string): boolean {
  return PASCAL_CASE_RE.test(name);
}

function classifyPropType(typeAnnotation: t.TSType): "any" | "unknown" | "string" | "other" {
  if (typeAnnotation.type === "TSAnyKeyword") return "any";
  if (typeAnnotation.type === "TSUnknownKeyword") return "unknown";
  if (typeAnnotation.type === "TSStringKeyword") return "string";
  return "other";
}

function collectPropFindings(
  componentName: string,
  typeMembers: t.TSTypeElement[],
  findings: ComponentPropFinding[],
): void {
  for (const member of typeMembers) {
    if (member.type !== "TSPropertySignature") continue;
    const propSig = member as t.TSPropertySignature;
    if (propSig.key.type !== "Identifier") continue;
    const propName = (propSig.key as t.Identifier).name;
    if (FRAMEWORK_ALLOWED_PROPS.has(propName)) continue;
    const ann = propSig.typeAnnotation?.typeAnnotation;
    if (!ann) continue;
    const kind = classifyPropType(ann);

    const loc = propSig.loc?.start ?? { line: 1, column: 1 };

    if (kind === "any" || kind === "unknown") {
      findings.push({
        componentName,
        propName,
        kind,
        line: loc.line,
        column: loc.column,
      });
      continue;
    }
    if (kind === "string" && VARIANT_PROP_RE.test(propName)) {
      findings.push({
        componentName,
        propName,
        kind: "string-variant",
        line: loc.line,
        column: loc.column,
      });
    }
  }
}

/**
 * Walk a parsed .tsx/.jsx source for exported PascalCase component declarations
 * and collect their typed prop violations.
 *
 * Resolves prop type references to same-file interface / type-alias declarations.
 * Cross-file references are skipped (v0.1 limitation, mirrors loaders/components.ts).
 */
function scanComponentContracts(
  source: string,
): { findings: ComponentPropFinding[]; componentCount: number } {
  const findings: ComponentPropFinding[] = [];
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

  const resolveAndCollect = (componentName: string, params: t.Node[]): void => {
    if (params.length === 0) return;
    const first = params[0]!;
    let typeAnnotation: t.TSType | undefined;
    if (
      first.type === "Identifier" &&
      (first as t.Identifier).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = (
        (first as t.Identifier).typeAnnotation as t.TSTypeAnnotation
      ).typeAnnotation;
    } else if (
      first.type === "ObjectPattern" &&
      (first as t.ObjectPattern).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = (
        (first as t.ObjectPattern).typeAnnotation as t.TSTypeAnnotation
      ).typeAnnotation;
    }
    if (!typeAnnotation) return;

    componentCount++;

    if (typeAnnotation.type === "TSTypeLiteral") {
      collectPropFindings(
        componentName,
        (typeAnnotation as t.TSTypeLiteral).members,
        findings,
      );
      return;
    }
    if (typeAnnotation.type === "TSTypeReference") {
      const ref = typeAnnotation as t.TSTypeReference;
      if (ref.typeName.type !== "Identifier") return;
      const refName = (ref.typeName as t.Identifier).name;
      const members = typeDeclarations.get(refName);
      if (members) {
        collectPropFindings(componentName, members, findings);
      }
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
            resolveAndCollect(id.name, decl.params);
          }
        } else if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) {
            if (d.id.type !== "Identifier") continue;
            const name = (d.id as t.Identifier).name;
            if (!isPascalCase(name)) continue;
            const init = d.init;
            if (init && init.type === "ArrowFunctionExpression") {
              resolveAndCollect(name, (init as t.ArrowFunctionExpression).params);
            } else if (init && init.type === "FunctionExpression") {
              resolveAndCollect(name, (init as t.FunctionExpression).params);
            }
          }
        }
      },
      ExportDefaultDeclaration(path) {
        const decl = path.node.declaration;
        if (decl.type === "FunctionDeclaration") {
          const id = (decl as t.FunctionDeclaration).id;
          const name = id?.name ?? "default";
          if (isPascalCase(name)) {
            resolveAndCollect(name, (decl as t.FunctionDeclaration).params);
          }
        }
      },
    });
  } catch {
    return { findings, componentCount };
  }

  return { findings, componentCount };
}

// ---------------------------------------------------------------------------
// package.json `types`/`typings` discovery
// ---------------------------------------------------------------------------

const PACKAGE_JSON_PATTERNS = [
  "**/package.json",
];

interface PackageJsonShape {
  name?: unknown;
  private?: unknown;
  types?: unknown;
  typings?: unknown;
  main?: unknown;
  module?: unknown;
  exports?: unknown;
}

function readJsonIfSmall(absPath: string): unknown | null {
  try {
    const stat = statSync(absPath);
    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;
    const raw = readFileSync(absPath, "utf8");
    if (raw.trim().length === 0) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

type PackageCheckOutcome =
  | { kind: "missing-types" }
  | { kind: "types-points-to-missing-file"; typesPath: string }
  | { kind: "ok"; typesPath: string };

function checkPackageJsonTypes(
  pkg: PackageJsonShape,
  packageDir: string,
): PackageCheckOutcome {
  const typesValue = typeof pkg.types === "string" ? pkg.types : null;
  const typingsValue = typeof pkg.typings === "string" ? pkg.typings : null;
  const declared = typesValue ?? typingsValue;
  if (!declared) {
    return { kind: "missing-types" };
  }
  const abs = join(packageDir, declared);
  if (!existsSync(abs)) {
    return { kind: "types-points-to-missing-file", typesPath: declared };
  }
  return { kind: "ok", typesPath: declared };
}

function looksLikePublishablePackage(pkg: PackageJsonShape): boolean {
  if (pkg.private === true) return false;
  if (typeof pkg.name !== "string" || pkg.name.length === 0) return false;
  return (
    typeof pkg.main === "string" ||
    typeof pkg.module === "string" ||
    pkg.exports !== undefined ||
    typeof pkg.types === "string" ||
    typeof pkg.typings === "string"
  );
}

function discoverPackageJsonFiles(ctx: RuleContext): string[] {
  if (!ctx.repoRoot) return [];
  let entries: string[] = [];
  try {
    entries = fg.sync(PACKAGE_JSON_PATTERNS, {
      cwd: ctx.repoRoot,
      absolute: false,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"],
      followSymbolicLinks: false,
    });
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const rel of entries) {
    if (isPathExcluded(rel, ctx.excludePaths)) continue;
    out.add(rel);
  }
  return Array.from(out).sort();
}

// ---------------------------------------------------------------------------
// Rule evaluator
// ---------------------------------------------------------------------------

const evaluate = async (
  ctx: RuleContext,
  files: ParsedFiles,
): Promise<RuleEvalResult> => {
  const findings: Finding[] = [];
  let opportunities = 0;

  for (const f of files.ts) {
    if (isPathExcluded(f.path, ctx.excludePaths)) continue;
    if (!/\.(tsx|jsx)$/.test(f.path)) continue;
    if (/\.(test|spec)\.(tsx?|jsx?)$/.test(f.path)) continue;
    if (!/\bexport\b/.test(f.source)) continue;

    const { findings: propFindings, componentCount } = scanComponentContracts(f.source);
    opportunities += componentCount;

    for (const pf of propFindings) {
      if (pf.kind === "any" || pf.kind === "unknown") {
        findings.push({
          ruleId: RULE_ID,
          axis: "components",
          severity: "error",
          location: { file: f.path, line: pf.line, column: pf.column },
          message: `Prop '${pf.componentName}.${pf.propName}' is typed '${pf.kind}' — AI agents cannot infer valid values`,
          suggestion:
            pf.kind === "any"
              ? `replace 'any' with a concrete type (string-literal union, interface, or imported type)`
              : `replace 'unknown' with a concrete type or refine with a runtime guard`,
        });
      } else {
        findings.push({
          ruleId: RULE_ID,
          axis: "components",
          severity: "warning",
          location: { file: f.path, line: pf.line, column: pf.column },
          message: `Variant-like prop '${pf.componentName}.${pf.propName}' is typed 'string' — use a string-literal union so AI agents know the allowed values`,
          suggestion: `change to a union like '"primary" | "secondary" | "ghost"'`,
        });
      }
    }
  }

  if (ctx.repoRoot) {
    const pkgJsonFiles = discoverPackageJsonFiles(ctx);
    for (const rel of pkgJsonFiles) {
      const abs = join(ctx.repoRoot, rel);
      const data = readJsonIfSmall(abs) as PackageJsonShape | null;
      if (!data) continue;
      if (!looksLikePublishablePackage(data)) continue;
      const outcome = checkPackageJsonTypes(data, dirname(abs));
      if (outcome.kind === "missing-types") {
        findings.push({
          ruleId: RULE_ID,
          axis: "components",
          severity: "warning",
          location: { file: rel, line: 1, column: 1 },
          message: `package.json is missing the 'types' (or 'typings') field — consumers and AI agents get no .d.ts surface`,
          suggestion: `add '"types": "./dist/index.d.ts"' (or the matching path for your build output)`,
        });
      } else if (outcome.kind === "types-points-to-missing-file") {
        findings.push({
          ruleId: RULE_ID,
          axis: "components",
          severity: "warning",
          location: { file: rel, line: 1, column: 1 },
          message: `package.json 'types' points to '${outcome.typesPath}' which does not exist — build output is missing or path is wrong`,
          suggestion: `run the package build, or update the 'types' field to point at the produced .d.ts file`,
        });
      }
    }
  }

  return { findings, opportunities };
};

export const rule: Rule = createLyseRule({
  meta: {
    axis: "components",
    lyseRuleId: RULE_ID,
    defaultSeverity: "warning",
    shortDescription: "Component prop contracts must be strictly typed and .d.ts shipped",
    fullDescription:
      "Scans exported PascalCase components in .tsx/.jsx files for lax TypeScript prop contracts that hinder AI-agent code generation: props typed `any` or `unknown` (error), and variant-like props (name matching variant/size/intent/color/tone/appearance/kind) typed plain `string` instead of a string-literal union (warning). Also checks each publishable package.json for a `types` or `typings` field and that the referenced file exists post-build (warning when missing).",
    helpUri:
      "https://github.com/lyse-labs/lyse/blob/main/docs/rules/components-contracts-strictness.md",
    rationale: `Why it matters

AI coding agents and IDE tooling rely on TypeScript prop signatures to suggest valid usages. A prop typed \`any\` or \`unknown\` is a black hole — the agent has nothing to constrain its output and falls back to guesses. A variant prop typed plain \`string\` (\`variant: string\`) is just as bad: the agent has no way to know the component accepts only \`"primary" | "secondary" | "ghost"\` and will happily suggest \`variant="huge"\`.

Shipping a \`.d.ts\` (declared via \`package.json\` \`types\` / \`typings\`) is the same problem at the package boundary: without a declaration file, downstream consumers and agents fall back to untyped any-mode and lose every guarantee the source code put in.

The rule errors on \`any\` / \`unknown\` because those are silent footguns. It warns on variant-string and missing \`.d.ts\` because there are legitimate (if narrow) reasons to leave them, and because the auto-fix path differs from the unsafe types.`,
    examples: [
      {
        good: `type ButtonVariant = "primary" | "secondary" | "ghost";\ninterface ButtonProps { variant: ButtonVariant; size: "sm" | "md" | "lg"; }\nexport function Button(props: ButtonProps) { return <button />; }`,
        bad: `interface ButtonProps { variant: string; size: any; data: unknown; }\nexport function Button(props: ButtonProps) { return <button />; }`,
      },
      {
        good: `{ "name": "@acme/ui", "main": "./dist/index.js", "types": "./dist/index.d.ts" }`,
        bad: `{ "name": "@acme/ui", "main": "./dist/index.js" }`,
      },
    ],
    allowlist: [
      "framework-allowed props: `children`, `ref`, `key`, `as`, `asChild` (rest-spread `...rest` and ref-forwarded types are skipped)",
      "private packages (`\"private\": true`) and non-publishable package.json files (no `name`/`main`/`module`/`exports`/`types`/`typings`)",
      "test files (.test.tsx, .spec.tsx)",
      "inline `// lyse-disable-next-line components/contracts-strictness` directive (handled by the global suppression engine)",
    ],
  },
  defaultOptions: [],
  create: () => ({ evaluate }),
});

export const _internal = {
  scanComponentContracts,
  checkPackageJsonTypes,
  looksLikePublishablePackage,
  VARIANT_PROP_RE,
  FRAMEWORK_ALLOWED_PROPS,
};
