import type { ResolveClass } from "../../graph/resolve/types.js";
import type { ZoneKind } from "../../graph/types.js";

export type RecallSource = "seeded";

export interface RecallBucket {
  ruleId: string;
  class: ResolveClass;
  zone: ZoneKind;
  seeded: number;
  caught: number;
  recall: number | null;
  recallWilsonLB: number | null;
  recallSource: RecallSource;
}

export interface RecallLedger {
  schemaVersion: 1;
  recallGeneratedFrom: { source: string; commit: string; measuredAt: string };
  buckets: RecallBucket[];
}
