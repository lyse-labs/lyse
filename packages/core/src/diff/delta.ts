import { anchorKey } from "./anchor.js";
import { computeGraphHash } from "./graph-hash.js";
import type { Baseline } from "./baseline.js";
import type { Finding } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

export interface DeltaResult {
  newFindings: Finding[];
  staleGraph: boolean;
}

export function selectNew(
  findings: readonly Finding[],
  baseline: Baseline,
  graph: DesignSystemGraph,
): DeltaResult {
  const groups = new Map<string, { file: string; rule: string; bucket: string; items: Finding[] }>();
  for (const f of findings) {
    const k = anchorKey(f);
    const mapKey = `${k.file}\u0000${k.rule}\u0000${k.bucket}`;
    const g = groups.get(mapKey);
    if (g) g.items.push(f);
    else groups.set(mapKey, { file: k.file, rule: k.rule, bucket: k.bucket, items: [f] });
  }

  const newFindings: Finding[] = [];
  for (const { file, rule, bucket, items } of groups.values()) {
    const base = baseline.findings[file]?.[rule]?.[bucket] ?? 0;
    const cur = items.length;
    if (cur <= base) continue;
    if (bucket === "*") {
      newFindings.push(...items); // occurrence: report all (mission 5.2)
    } else {
      const sorted = [...items].sort(byLineCol);
      newFindings.push(...sorted.slice(sorted.length - (cur - base))); // content: surplus only
    }
  }
  newFindings.sort(byLineColRule);

  return { newFindings, staleGraph: computeGraphHash(graph) !== baseline.graphHash };
}

function byLineCol(a: Finding, b: Finding): number {
  return a.location.line - b.location.line || a.location.column - b.location.column;
}
function byLineColRule(a: Finding, b: Finding): number {
  return (
    a.location.file.localeCompare(b.location.file) ||
    a.location.line - b.location.line ||
    a.location.column - b.location.column ||
    String(a.ruleId).localeCompare(String(b.ruleId))
  );
}
