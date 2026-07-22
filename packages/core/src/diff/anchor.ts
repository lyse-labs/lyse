import { createHash } from "node:crypto";
import type { Finding } from "../types.js";

export interface AnchorKey {
  file: string;
  rule: string;
  /** Normalized drifted literal for content-anchored findings, else "*". */
  bucket: string;
}

export function anchorKey(f: Finding): AnchorKey {
  const from = f.fixGroup?.from;
  return { file: f.location.file, rule: String(f.ruleId), bucket: from && from.length > 0 ? from : "*" };
}

export function computeFindingId(f: Finding, indexWithinKey: number): string {
  const k = anchorKey(f);
  const kind = k.bucket === "*" ? "o" : "c";
  return createHash("sha256")
    .update([k.rule, k.file, kind, k.bucket, String(indexWithinKey)].join("\u0000"))
    .digest("hex");
}

export function findingIdsFor(findings: readonly Finding[]): Map<Finding, string> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const k = anchorKey(f);
    const mapKey = `${k.file}\u0000${k.rule}\u0000${k.bucket}`;
    const arr = groups.get(mapKey);
    if (arr) arr.push(f);
    else groups.set(mapKey, [f]);
  }
  const out = new Map<Finding, string>();
  for (const arr of groups.values()) {
    const sorted = [...arr].sort(
      (a, b) => a.location.line - b.location.line || a.location.column - b.location.column,
    );
    for (let i = 0; i < sorted.length; i++) out.set(sorted[i]!, computeFindingId(sorted[i]!, i));
  }
  return out;
}
