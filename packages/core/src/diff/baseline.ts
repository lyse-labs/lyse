import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sortKeysDeep } from "../json-sort-keys.js";
import { anchorKey } from "./anchor.js";
import { computeGraphHash } from "./graph-hash.js";
import type { AuditResult, AxisName } from "../types.js";
import type { DesignSystemGraph } from "../graph/types.js";

export type BaselineFindings = Record<string, Record<string, Record<string, number>>>;

/**
 * Bumped whenever `computeGraphHash` changes what it covers. A baseline written
 * under an older schema carries a hash from a different formula, so comparing
 * the two says nothing about the repository — see `graphHashComparable`.
 */
export const CURRENT_BASELINE_SCHEMA = 2;

export interface Baseline {
  schemaVersion: 1 | 2;
  graphHash: string;
  scores: Partial<Record<AxisName, number>>;
  findings: BaselineFindings;
}

/**
 * Only a baseline written under the current schema can be checked for staleness.
 * Without this, widening the hash would mark every committed baseline stale and
 * turn a green CI red on upgrade, on a tree nobody touched.
 */
export function graphHashComparable(b: Baseline): boolean {
  return b.schemaVersion === CURRENT_BASELINE_SCHEMA;
}

export class BaselineError extends Error {
  override name = "BaselineError";
}

export function buildBaseline(result: AuditResult, graph: DesignSystemGraph): Baseline {
  const findings: BaselineFindings = {};
  for (const f of result.findings) {
    const { file, rule, bucket } = anchorKey(f);
    const byRule = (findings[file] ??= {});
    const byBucket = (byRule[rule] ??= {});
    byBucket[bucket] = (byBucket[bucket] ?? 0) + 1;
  }
  const scores: Partial<Record<AxisName, number>> = {};
  for (const a of result.axes) if (typeof a.score === "number") scores[a.axis] = a.score;
  return { schemaVersion: CURRENT_BASELINE_SCHEMA, graphHash: computeGraphHash(graph), scores, findings };
}

export function serializeBaseline(b: Baseline): string {
  return JSON.stringify(sortKeysDeep(b), null, 2) + "\n";
}

export function writeBaseline(path: string, b: Baseline): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeBaseline(b), "utf8");
}

export function readBaseline(path: string): Baseline {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new BaselineError(
      `No baseline found at ${path}. Run \`lyse baseline write\` first, then commit .lyse/baseline.json.`,
    );
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isValidBaselineShape(parsed)) throw new Error("shape");
    return parsed;
  } catch {
    throw new BaselineError(`Malformed baseline at ${path}. Re-run \`lyse baseline write\`.`);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isValidBaselineShape(v: unknown): v is Baseline {
  if (!isPlainObject(v)) return false;
  return (
    (v["schemaVersion"] === 1 || v["schemaVersion"] === 2) &&
    isPlainObject(v["findings"]) &&
    typeof v["graphHash"] === "string" &&
    isPlainObject(v["scores"])
  );
}
