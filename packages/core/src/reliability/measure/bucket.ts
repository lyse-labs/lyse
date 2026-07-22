import type { ResolveClass } from "../../graph/resolve/types.js";
import type { ZoneKind } from "../../graph/types.js";

export type BucketClass = ResolveClass | "n/a";
export type LabelSource = "auto" | "llm-provisional" | "human-validated" | "none";

export interface LedgerBucket {
  ruleId: string;
  class: BucketClass;
  zone: ZoneKind;
  n: number;
  precision: number | null;
  precisionWilsonLB: number | null;
  recall: number | null;
  recallWilsonLB: number | null;
  labelSource: LabelSource;
  gateEligible: boolean;
}

export interface RulePrecisionLedger {
  schemaVersion: 1;
  generatedFrom: { corpus: string; commit: string; measuredAt: string };
  buckets: LedgerBucket[];
}

// U+001F unit separator can't appear in a ruleId, class or zone token.
const DELIM = String.fromCharCode(31);

export function bucketKey(ruleId: string, cls: BucketClass, zone: ZoneKind): string {
  return `${ruleId}${DELIM}${cls}${DELIM}${zone}`;
}

const MIN_GATE_N = 35;
const GATE_THRESHOLD = 0.9;

export function gateEligibleFor(b: Omit<LedgerBucket, "gateEligible">): boolean {
  return (
    b.labelSource === "auto" &&
    b.n >= MIN_GATE_N &&
    b.precisionWilsonLB !== null &&
    b.precisionWilsonLB >= GATE_THRESHOLD
  );
}
