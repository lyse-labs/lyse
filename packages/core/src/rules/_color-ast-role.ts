import { join } from "node:path";
import { getTsMorphProject } from "../parsers/ts-morph-project.js";
import type { Node } from "ts-morph";

export type ColorRole = "canvas" | "default-prop" | "svg-art" | "styling" | "unknown";

export interface ColorRoleArgs {
  repoRoot: string;
  file: string;
  line: number;
  column: number;
}

const CANVAS_PROPS = new Set(["fillStyle", "strokeStyle", "shadowColor"]);

const COLOR_ISH_NAMES = new Set([
  "color", "fill", "stroke", "background", "bg", "tint", "shadow",
]);

const SVG_ELEMENTS = new Set([
  "path", "svg", "circle", "rect", "g", "polygon", "line", "ellipse", "polyline",
]);

const MAX_ANCESTOR_WALK = 6;

export function classifyColorRole(args: ColorRoleArgs): ColorRole {
  try {
    const { repoRoot, file, line, column } = args;

    const absFile = isAbsolutePath(file) ? file : join(repoRoot, file);
    const tsm = getTsMorphProject(repoRoot);
    const sf = tsm.getSourceFile(absFile);
    if (!sf) return "unknown";

    // ts-morph uses 0-based lines but line in our contract is 1-based
    const pos = sf.compilerNode.getPositionOfLineAndCharacter(line - 1, Math.max(0, column - 1));
    const node = sf.getDescendantAtPos(pos);
    if (!node) return "unknown";

    // Walk ancestors (bounded) checking each pattern in priority order
    let current: Node | undefined = node.getParent();
    for (let i = 0; i < MAX_ANCESTOR_WALK && current !== undefined; i++) {
      const role = checkNode(current);
      if (role !== null) return role;
      current = current.getParent();
    }

    return "styling";
  } catch {
    return "unknown";
  }
}

function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[/\\]/.test(p);
}

// Returns a role if this ancestor node matches a pattern, null to continue walking.
function checkNode(node: Node): ColorRole | null {
  const kind = node.getKindName();

  // --- canvas: BinaryExpression where LHS is PropertyAccessExpression ending in fillStyle/strokeStyle/shadowColor ---
  if (kind === "BinaryExpression") {
    const n = node as unknown as { getLeft(): { getKindName(): string; getName(): string } };
    const left = n.getLeft();
    if (left.getKindName() === "PropertyAccessExpression") {
      if (CANVAS_PROPS.has(left.getName())) {
        return "canvas";
      }
    }
  }

  // --- default-prop: BindingElement or Parameter that has a default and a color-ish name ---
  if (kind === "BindingElement" || kind === "Parameter") {
    const n = node as unknown as {
      getNameNode(): { getText(): string };
      getInitializer(): Node | undefined;
    };
    if (n.getInitializer() !== undefined) {
      const name = n.getNameNode().getText().toLowerCase();
      if (COLOR_ISH_NAMES.has(name)) return "default-prop";
    }
  }

  // --- default-prop: PropertyAssignment under a defaultProps object ---
  if (kind === "PropertyAssignment") {
    const n = node as unknown as {
      getName(): string;
    };
    const propName = (n.getName() ?? "").toLowerCase();
    if (COLOR_ISH_NAMES.has(propName)) {
      // Check if this property is a DIRECT child of an object that is the RHS of defaultProps assignment.
      // Pattern: PropertyAssignment → ObjectLiteralExpression → BinaryExpression (LHS = defaultProps)
      const objectLiteral = node.getParent();
      if (objectLiteral?.getKindName() === "ObjectLiteralExpression") {
        const binExpr = objectLiteral.getParent();
        if (binExpr?.getKindName() === "BinaryExpression") {
          const asBin = binExpr as unknown as { getLeft(): { getKindName(): string; getName(): string } };
          const aLeft = asBin.getLeft();
          if (aLeft.getKindName() === "PropertyAccessExpression" && aLeft.getName() === "defaultProps") {
            return "default-prop";
          }
        }
      }
    }
  }

  // --- svg-art: JsxAttribute named fill/stroke on a lowercase SVG element ---
  if (kind === "JsxAttribute") {
    const n = node as unknown as {
      getNameNode(): { getText(): string };
    };
    const attrName = n.getNameNode().getText().toLowerCase();
    if (attrName === "fill" || attrName === "stroke") {
      // JsxAttribute → JsxAttributes → JsxOpeningElement or JsxSelfClosingElement
      const jsxAttrs = node.getParent();
      const jsxElem = jsxAttrs?.getParent();
      if (jsxElem) {
        const pk = jsxElem.getKindName();
        if (pk === "JsxOpeningElement" || pk === "JsxSelfClosingElement") {
          const p = jsxElem as unknown as { getTagNameNode(): { getText(): string } };
          const tag = p.getTagNameNode().getText().toLowerCase();
          if (SVG_ELEMENTS.has(tag)) return "svg-art";
        }
      }
    }
  }

  return null;
}
