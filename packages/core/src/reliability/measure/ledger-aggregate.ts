import { bucketKey, type LedgerBucket } from "./bucket.js";
import { wilsonLowerBound } from "../catalogue/promotion.js";
import { axisForRuleId, resolveRowClass } from "./resolve-row-class.js";
import { verifyExact } from "./exact-verifier.js";
import { zoneOf } from "../../graph/query.js";
import type { Resolver } from "../../graph/resolve/index.js";
import type { ResolveClass } from "../../graph/resolve/types.js";
import type { DesignSystemGraph, ZoneKind } from "../../graph/types.js";
import type { FindingRow } from "./finding-row.js";

/**
 * One enriched, per-finding measurement row. Only token-rule findings reach the
 * ledger. `exactVerdict` is the deterministic verdict from `verifyExact`,
 * pre-computed at harvest (where the repo's graph + resolver are in scope);
 * it is present iff `class === "exact"`. Near/novel/unresolved rows carry no
 * verdict — those classes are LLM-judge candidates, not measured in this run.
 */
export interface LedgerRow {
  ruleId: string;
  class: ResolveClass;
  zone: ZoneKind;
  exactVerdict?: "tp" | "fp";
}

/**
 * Classify one token finding into a LedgerRow, re-resolving its class
 * independently (NOT from the finding's confidence). For `exact`-class rows the
 * deterministic `verifyExact` verdict is attached here — the caller must have the
 * repo's graph + resolver in scope. Returns null for non-token rules.
 */
export function classifyTokenFinding(
  ruleId: string,
  file: string,
  line: number,
  literal: string,
  graph: DesignSystemGraph,
  resolver: Resolver,
): LedgerRow | null {
  const axis = axisForRuleId(ruleId);
  if (axis === null) return null;

  const cls = resolveRowClass(literal, axis, resolver);
  const zone = zoneOf(graph, file);

  if (cls === "exact") {
    const row: FindingRow = {
      ruleId,
      repo: "",
      file,
      line,
      snippet: "",
      fileType: file.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "",
      confidence: "high",
    };
    const label = verifyExact(row, literal, graph, resolver);
    return { ruleId, class: "exact", zone, exactVerdict: label.verdict };
  }

  return { ruleId, class: cls, zone };
}

type BucketDraft = Omit<LedgerBucket, "gateEligible">;

/**
 * Group rows by (ruleId, class, zone) and aggregate each bucket.
 * - exact buckets: tallied deterministically → precision + Wilson LB, labelSource "auto".
 * - other classes: counted only (candidate, unjudged) → precision null, labelSource "none".
 */
export function aggregateBuckets(rows: LedgerRow[]): BucketDraft[] {
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    const key = bucketKey(row.ruleId, row.class, row.zone);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  const drafts: BucketDraft[] = [];
  for (const group of groups.values()) {
    const first = group[0]!;
    if (first.class === "exact") {
      const tp = group.filter((r) => r.exactVerdict === "tp").length;
      const fp = group.filter((r) => r.exactVerdict === "fp").length;
      const measured = tp + fp;
      drafts.push({
        ruleId: first.ruleId,
        class: "exact",
        zone: first.zone,
        n: measured,
        precision: measured > 0 ? tp / measured : null,
        precisionWilsonLB: measured > 0 ? wilsonLowerBound(tp, measured) : null,
        recall: null,
        recallWilsonLB: null,
        labelSource: measured > 0 ? "auto" : "none",
      });
    } else {
      drafts.push({
        ruleId: first.ruleId,
        class: first.class,
        zone: first.zone,
        n: group.length,
        precision: null,
        precisionWilsonLB: null,
        recall: null,
        recallWilsonLB: null,
        labelSource: "none",
      });
    }
  }
  return drafts;
}
