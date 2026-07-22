import {
  bucketKey,
  gateEligibleFor,
  type LedgerBucket,
  type RulePrecisionLedger,
} from "./bucket.js";

export function buildLedger(
  buckets: Array<Omit<LedgerBucket, "gateEligible">>,
  meta: RulePrecisionLedger["generatedFrom"],
): RulePrecisionLedger {
  const withGate: LedgerBucket[] = buckets.map((b) => ({
    ...b,
    gateEligible: gateEligibleFor(b),
  }));
  withGate.sort((a, b) =>
    bucketKey(a.ruleId, a.class, a.zone).localeCompare(
      bucketKey(b.ruleId, b.class, b.zone),
    ),
  );
  return { schemaVersion: 1, generatedFrom: meta, buckets: withGate };
}

export function serializeLedger(ledger: RulePrecisionLedger): string {
  return JSON.stringify(ledger, null, 2) + "\n";
}
