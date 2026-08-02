/**
 * The exit-code decision for `measure:oracle`, extracted so it can be tested.
 *
 * It exists because the first version got this exactly backwards. Its own header
 * said "silence about what was NOT measured is the failure mode this whole
 * harness exists to prevent", and then computed
 * `exitCode = failed.length > 0 ? 1 : 0` — where a repo that was never on disk
 * is "skipped", and skipped is not failed. Reproduced against an empty corpus
 * directory: `0 within tolerance · 0 out · 6 not measured`, exit 0. A run that
 * checked six repositories and a run that checked none emitted the same verdict,
 * so a flaky clone at 3am would have passed every candidate for the rest of the
 * night, silently.
 *
 * The rule this encodes: **not measured is not a pass.** Standard gate practice
 * distinguishes pass / fail / error / timeout / skipped and defaults every
 * outcome except pass to failure. Anything else builds a gate that cannot
 * distinguish "healthy" from "asleep", and a no-op gate is invisible precisely
 * because it never complains.
 */
export type Verdict = "ok" | "out-of-tolerance" | "skipped";

export interface VerdictRow {
  name: string;
  verdict: Verdict;
}

export interface OracleOutcome {
  exitCode: 0 | 1;
  /** Why the run failed, empty when it passed. Printed; never swallowed. */
  reasons: string[];
}

export function decideOutcome(rows: readonly VerdictRow[]): OracleOutcome {
  const reasons: string[] = [];

  if (rows.length === 0) {
    reasons.push("no repositories were evaluated — the corpus is empty or unreadable");
  }

  const skipped = rows.filter((r) => r.verdict === "skipped");
  if (skipped.length > 0) {
    reasons.push(
      `${skipped.length} repositor${skipped.length === 1 ? "y" : "ies"} could not be measured: ` +
        `${skipped.map((r) => r.name).join(", ")}`,
    );
  }

  const failed = rows.filter((r) => r.verdict === "out-of-tolerance");
  if (failed.length > 0) {
    reasons.push(
      `${failed.length} outside tolerance: ${failed.map((r) => r.name).join(", ")}`,
    );
  }

  return { exitCode: reasons.length > 0 ? 1 : 0, reasons };
}
