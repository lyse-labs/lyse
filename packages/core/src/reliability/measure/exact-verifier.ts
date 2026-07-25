import { zoneOf } from "../../graph/query.js";
import { isTrivialColor } from "../../graph/resolve/trivial-color.js";
import { axisForRuleId, resolveRowClass } from "./resolve-row-class.js";
import type { Label } from "./auto-label.js";
import type { FindingRow } from "./finding-row.js";
import type { Resolver } from "../../graph/resolve/index.js";
import type { DesignSystemGraph } from "../../graph/types.js";

const TOKEN_DEF_FILE_RE = /(?:^|\/)(?:[^/]+\.tokens\.json|tokens\.(?:ts|js|css)|theme\.(?:ts|js))$/;

function isTokenDefinitionFile(file: string): boolean {
  if (TOKEN_DEF_FILE_RE.test(file)) return true;
  return file.split("/").includes("tokens");
}

export function verifyExact(
  row: FindingRow,
  literal: string,
  graph: DesignSystemGraph,
  resolver: Resolver,
): Label {
  const axis = axisForRuleId(row.ruleId);
  if (axis === null) {
    throw new Error(`verifyExact only accepts token rules; "${row.ruleId}" has no axis`);
  }

  const reclassified = resolveRowClass(literal, axis, resolver);
  if (reclassified !== "exact") {
    throw new Error(
      `verifyExact called on a non-exact row: "${row.ruleId}" @ ${row.file}:${row.line} re-resolved to "${reclassified}"`,
    );
  }

  if (zoneOf(graph, row.file) !== "app") {
    return { verdict: "fp", source: "auto", reason: "non-app zone" };
  }

  if (isTrivialColor(literal)) {
    return { verdict: "fp", source: "auto", reason: "trivial value" };
  }

  if (isTokenDefinitionFile(row.file)) {
    return { verdict: "fp", source: "auto", reason: "token-definition file" };
  }

  return { verdict: "tp", source: "auto", reason: "exact drift confirmed" };
}
