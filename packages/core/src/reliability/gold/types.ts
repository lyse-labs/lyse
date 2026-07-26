import type { ResolveClass } from "../../graph/resolve/types.js";
import type { ZoneKind } from "../../graph/types.js";

export interface GoldLabel {
  repo: string;
  commit: string;
  parent: string;
  file: string;
  line: number;
  literal: string;
  expectedToken: string;
  axis: "colors";
  ruleId: "tokens/no-hardcoded-color";
}

export interface MinedRecallBucket {
  ruleId: string;
  class: ResolveClass;
  zone: ZoneKind;
  labels: number;
  caught: number;
  recall: number | null;
  recallWilsonLB: number | null;
  recallSource: "git-mined";
}

export interface MinedRecallLedger {
  schemaVersion: 1;
  recallGeneratedFrom: {
    source: string;
    commit: string;
    measuredAt: string;
  };
  buckets: MinedRecallBucket[];
}
