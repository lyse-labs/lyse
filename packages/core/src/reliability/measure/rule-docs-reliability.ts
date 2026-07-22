import { renderBucketLine } from "./report.js";
import type { RulePrecisionLedger } from "./bucket.js";

export const RELIABILITY_START = "<!-- reliability:auto:start -->";
export const RELIABILITY_END = "<!-- reliability:auto:end -->";

/** The lines for one rule's buckets (or a not-measured note if it has none). */
export function renderRuleReliability(ruleId: string, ledger: RulePrecisionLedger): string {
  const buckets = ledger.buckets.filter((b) => b.ruleId === ruleId);
  if (buckets.length === 0) return "_No per-class measurement data yet._";
  return buckets.map(renderBucketLine).join("\n");
}

/**
 * Return `doc` with the reliability auto-section set to the current ledger render.
 * If both markers are present, replace only the content between them (rest byte-identical).
 * Otherwise append a fresh `## Reliability` section with markers. Idempotent.
 */
export function spliceReliabilitySection(
  doc: string,
  ruleId: string,
  ledger: RulePrecisionLedger,
): string {
  const body = renderRuleReliability(ruleId, ledger);
  const block = `${RELIABILITY_START}\n${body}\n${RELIABILITY_END}`;
  const start = doc.indexOf(RELIABILITY_START);
  const end = doc.indexOf(RELIABILITY_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = doc.slice(0, start);
    const after = doc.slice(end + RELIABILITY_END.length);
    return before + block + after;
  }
  const sep = doc.endsWith("\n") ? "\n" : "\n\n";
  return `${doc}${sep}## Reliability\n\n${block}\n`;
}
