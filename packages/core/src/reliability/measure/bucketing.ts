import { bucketKey, type BucketClass } from "./bucket.js";
import type { FindingRow } from "./finding-row.js";
import type { ZoneKind } from "../../graph/types.js";

export function groupIntoBuckets(
  rows: FindingRow[],
  zoneForRow: (row: FindingRow) => ZoneKind,
): Map<string, FindingRow[]> {
  const buckets = new Map<string, FindingRow[]>();
  for (const row of rows) {
    const cls: BucketClass = row.resolutionClass ?? "n/a";
    const key = bucketKey(row.ruleId, cls, zoneForRow(row));
    const existing = buckets.get(key);
    if (existing) existing.push(row);
    else buckets.set(key, [row]);
  }
  return buckets;
}
