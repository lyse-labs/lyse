import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import type { TraverseOptions } from "@babel/traverse";
import type * as t from "@babel/types";
import type { ParsedTsFile, ComponentInventoryEntry, ComponentPropEntry } from "../types.js";

type TraverseFn = (ast: t.Node, opts: TraverseOptions) => void;

// Babel CJS-vs-ESM interop: the callable lives at .default in some environments.
const traverse = (
  (_traverse as unknown as { default: TraverseFn }).default ??
  (_traverse as unknown as TraverseFn)
);

/**
 * Extract the string value from a TSLiteralType node (string literals only).
 * Returns undefined for non-string literals.
 */
function stringLiteralValue(node: t.TSType): string | undefined {
  if (node.type !== "TSLiteralType") return undefined;
  const lit = (node as t.TSLiteralType).literal;
  if (lit.type === "StringLiteral") return lit.value;
  return undefined;
}

/**
 * Check whether a TSType is a string-literal union (all members are string literals).
 * Returns the variant strings if true, undefined otherwise.
 */
function extractStringLiteralUnion(typeAnnotation: t.TSType): string[] | undefined {
  if (typeAnnotation.type !== "TSUnionType") return undefined;
  const union = typeAnnotation as t.TSUnionType;
  const variants: string[] = [];
  for (const member of union.types) {
    const val = stringLiteralValue(member);
    if (val === undefined) return undefined; // mixed union — not a pure string-literal union
  }
  // Second pass to build the list (only reached if all members are string literals)
  for (const member of union.types) {
    variants.push(stringLiteralValue(member)!);
  }
  return variants.length > 0 ? variants : undefined;
}

/**
 * Extract the raw type text from source using AST node start/end positions.
 */
function sliceTypeText(source: string, node: t.TSType): string {
  if (node.start != null && node.end != null) {
    return source.slice(node.start, node.end).trim();
  }
  return "";
}

/**
 * Extract props from a TypeScript object type annotation (TSTypeLiteral).
 * Also handles destructured parameter defaults.
 *
 * @param source - full source text of the file (for slicing type annotations)
 * @param typeMembers - the members of a TSTypeLiteral or TSPropertySignature list
 * @param defaultValues - map of propName → defaultValue from destructuring (may be empty)
 */
function extractPropsFromTypeMembers(
  source: string,
  typeMembers: t.TSTypeElement[],
  defaultValues: Map<string, string>,
): ComponentPropEntry[] {
  const props: ComponentPropEntry[] = [];
  for (const member of typeMembers) {
    if (member.type !== "TSPropertySignature") continue;
    const propSig = member as t.TSPropertySignature;
    if (propSig.key.type !== "Identifier") continue;
    const propName = (propSig.key as t.Identifier).name;

    let typeText: string | undefined;
    let isVariantUnion: boolean | undefined;
    let variants: string[] | undefined;

    const ann = propSig.typeAnnotation?.typeAnnotation;
    if (ann) {
      typeText = sliceTypeText(source, ann);
      const extracted = extractStringLiteralUnion(ann);
      if (extracted) {
        isVariantUnion = true;
        variants = extracted;
      }
    }

    const defaultValue = defaultValues.get(propName);

    const entry: ComponentPropEntry = {
      name: propName,
      ...(typeText !== undefined && { typeText }),
      ...(propSig.optional === true && { isOptional: true }),
      ...(defaultValue !== undefined && { defaultValue }),
      ...(isVariantUnion !== undefined && { isVariantUnion }),
      ...(variants !== undefined && { variants }),
    };
    props.push(entry);
  }
  return props;
}

/**
 * Extract default values from a destructured function parameter.
 * e.g. `function Button({ variant = "primary", size = "md" }: ButtonProps)`
 * Returns a map of propName → defaultValue (as source text).
 */
function extractDestructuringDefaults(param: t.Node): Map<string, string> {
  const defaults = new Map<string, string>();
  if (param.type !== "ObjectPattern") return defaults;
  for (const prop of (param as t.ObjectPattern).properties) {
    if (prop.type !== "ObjectProperty") continue;
    const objProp = prop as t.ObjectProperty;
    if (objProp.key.type !== "Identifier") continue;
    if (!objProp.value || objProp.value.type !== "AssignmentPattern") continue;
    const assign = objProp.value as t.AssignmentPattern;
    const key = (objProp.key as t.Identifier).name;
    // Extract the right-hand side as text
    if (assign.right.type === "StringLiteral") {
      defaults.set(key, (assign.right as t.StringLiteral).value);
    } else if (assign.right.type === "NumericLiteral") {
      defaults.set(key, String((assign.right as t.NumericLiteral).value));
    } else if (assign.right.type === "BooleanLiteral") {
      defaults.set(key, String((assign.right as t.BooleanLiteral).value));
    }
    // Complex default expressions are not extracted
  }
  return defaults;
}

/**
 * Extract props from a component's source file.
 * Returns an array of ComponentPropEntry, or undefined if extraction fails.
 *
 * Extraction strategy:
 * 1. Walk function declarations and arrow function exports named as PascalCase components.
 * 2. Find the first parameter's type annotation.
 * 3. If it's a TSTypeLiteral (inline props), extract directly.
 * 4. If it's a reference (e.g. ButtonProps), look for a matching interface or type alias in the file.
 *    - If found, extract from it.
 *    - If not found (cross-file), return [{ name: "<ref>", typeText: "<ref>" }] as a placeholder.
 *
 * Limitation (documented): cross-file prop type resolution is deferred to v0.2.
 */
export function extractComponentProps(componentName: string, source: string): ComponentPropEntry[] | undefined {
  let ast: t.File;
  try {
    ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
      errorRecovery: true,
    });
  } catch {
    return undefined;
  }

  // Collect all top-level interface/type alias declarations for lookup
  const typeDeclarations = new Map<string, t.TSTypeElement[]>();
  try {
    traverse(ast, {
      TSInterfaceDeclaration(path) {
        const members = path.node.body.body;
        typeDeclarations.set(path.node.id.name, members);
      },
      TSTypeAliasDeclaration(path) {
        const ann = path.node.typeAnnotation;
        if (ann.type === "TSTypeLiteral") {
          typeDeclarations.set(path.node.id.name, (ann as t.TSTypeLiteral).members);
        }
      },
    });
  } catch {
    return undefined;
  }

  // Now walk for the component function and extract props
  let foundProps: ComponentPropEntry[] | undefined;

  const extractFromFunctionParam = (params: t.Node[]): ComponentPropEntry[] | undefined => {
    if (params.length === 0) return [];
    const firstParam = params[0]!;

    // Gather destructuring defaults
    let defaultValues = new Map<string, string>();
    if (firstParam.type === "ObjectPattern") {
      defaultValues = extractDestructuringDefaults(firstParam);
    }

    // Resolve the type annotation
    let typeAnnotation: t.TSType | undefined;
    if (
      firstParam.type === "Identifier" &&
      (firstParam as t.Identifier).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = ((firstParam as t.Identifier).typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
    } else if (
      firstParam.type === "ObjectPattern" &&
      (firstParam as t.ObjectPattern).typeAnnotation?.type === "TSTypeAnnotation"
    ) {
      typeAnnotation = ((firstParam as t.ObjectPattern).typeAnnotation as t.TSTypeAnnotation).typeAnnotation;
    } else if (firstParam.type === "ObjectPattern") {
      // Destructured object without type annotation — no type info available
      return defaultValues.size > 0
        ? [...defaultValues.entries()].map(([name, defaultValue]) => ({ name, defaultValue }))
        : [];
    }

    if (!typeAnnotation) return [];

    if (typeAnnotation.type === "TSTypeLiteral") {
      // Inline props object
      return extractPropsFromTypeMembers(source, (typeAnnotation as t.TSTypeLiteral).members, defaultValues);
    }

    if (typeAnnotation.type === "TSTypeReference") {
      const ref = typeAnnotation as t.TSTypeReference;
      if (ref.typeName.type === "Identifier") {
        const refName = (ref.typeName as t.Identifier).name;
        // Look up in same-file declarations
        const members = typeDeclarations.get(refName);
        if (members) {
          return extractPropsFromTypeMembers(source, members, defaultValues);
        }
        // Cross-file reference: return a placeholder entry.
        // Full cross-file resolution deferred to v0.2.
        return [{ name: refName, typeText: refName }];
      }
    }

    // "any", intersections, conditionals, etc. — skip variant extraction
    const typeText = sliceTypeText(source, typeAnnotation);
    return typeText ? [{ name: "props", typeText }] : [];
  };

  try {
    traverse(ast, {
      FunctionDeclaration(path) {
        if (foundProps !== undefined) return;
        const id = path.node.id;
        if (!id || id.name !== componentName) return;
        // Skip generics with complex constraints — just extract from params
        foundProps = extractFromFunctionParam(path.node.params) ?? undefined;
        path.stop();
      },
      VariableDeclarator(path) {
        if (foundProps !== undefined) return;
        const id = path.node.id;
        if (id.type !== "Identifier" || (id as t.Identifier).name !== componentName) return;
        const init = path.node.init;
        if (!init) return;
        // Arrow function: const Button = (...) => ...
        if (init.type === "ArrowFunctionExpression") {
          foundProps = extractFromFunctionParam((init as t.ArrowFunctionExpression).params) ?? undefined;
          path.stop();
        }
      },
    });
  } catch {
    return undefined;
  }

  return foundProps;
}

/**
 * Build the component inventory by scanning ParsedTsFile imports for components
 * from the given DS module. Optionally accepts a map of source files from the DS
 * package itself to extract prop/variant information.
 *
 * @param module - the DS module specifier, e.g. "@acme/ui"
 * @param files - parsed application files (used to count usages)
 * @param componentSources - optional map of component name → source text for prop extraction
 */
export function buildComponentInventory(
  module: string,
  files: ParsedTsFile[],
  componentSources?: Map<string, string>,
): ComponentInventoryEntry[] {
  const counts = new Map<string, number>();
  for (const f of files) {
    for (const imp of f.imports) {
      if (imp.module !== module) continue;
      for (const n of imp.named) counts.set(n, (counts.get(n) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, usageCount]) => {
    const entry: ComponentInventoryEntry = { name, module, usageCount };
    if (componentSources) {
      const src = componentSources.get(name);
      if (src !== undefined) {
        const props = extractComponentProps(name, src);
        if (props !== undefined) {
          entry.props = props;
        }
      }
    }
    return entry;
  });
}
