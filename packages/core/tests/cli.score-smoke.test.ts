/**
 * Track 8.10 — First Trusted Score smoke test.
 *
 * Pins the Health Score produced by `lyse explain --score` against the
 * full-ds fixture so that a scoring regression turns CI red.
 *
 * H4 (Scoring v3 project, Task 6): `explain --score` no longer computes its
 * own headline number with formula-v1 — it now surfaces the audit result's
 * `finalScore` byte-for-byte (see `tests/h4-invariant.test.ts`, which asserts
 * this directly against `auditDirectory(...).result.finalScore`). This smoke
 * test therefore pins the *audit* scorer's output (default model: v2-legacy,
 * `scoring-v1.1`), not the retired formula-v1 preview. Old bands tuned to
 * formula-v1 (e.g. [70,76]) are void — full-ds under the audit scorer scores
 * substantially lower (auto-fail: tokens and ai-surface both hit 0% adoption).
 *
 * Bands (not exact pins) so small noise deltas don't create false positives:
 *   - Health Score:       N ∈ [34, 40]  (±3 around 37)
 *   - Counted findings:   M ∈ [9, 13]   (guards against stableSubAxes going empty → trivial 100)
 *   - Scoring path:       "scoring-v1.1" (the audit's default v2-legacy scorer)
 *
 * NOTE: `--static-only` is passed explicitly so the score is deterministic
 * regardless of whether `claude` is on PATH. The LLM precision filter (#115)
 * is default-ON when a connector resolves (e.g. agent-cli auto-selected on
 * dev machines), which would non-deterministically vary the finding count and
 * therefore the score. `--static-only` makes the filter a no-op, keeping the
 * static floor byte-for-byte identical in CI and on local dev machines.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { LYSE_CLI_PATH } from "./_helpers/cli.js";
import { SCORING_V2_LEGACY } from "../src/reliability/score/version-pin.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../fixtures/full-ds");

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, "");
}

describe("cli explain --score smoke (Track 8.10)", () => {
  it("Health Score is within [34, 40] and the audit scorer (scoring-v1.1) is active", { timeout: 30_000 }, () => {
    if (!existsSync(LYSE_CLI_PATH)) {
      throw new Error(
        `CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${LYSE_CLI_PATH}`,
      );
    }

    const r = spawnSync("node", [LYSE_CLI_PATH, "explain", "--score", "--static-only", fixture], {
      encoding: "utf8",
    });

    expect(r.status, `explain --score exited non-zero:\n${r.stderr}`).toBe(0);

    const out = stripAnsi(r.stdout);

    // --- Health Score band ---
    const scoreMatch = out.match(/Health Score:\s*(\d+)\s*\/\s*100/);
    expect(scoreMatch, "Health Score line not found in output").not.toBeNull();
    const score = parseInt(scoreMatch![1]!, 10);
    expect(
      score,
      `Health Score ${score} is outside expected band [34, 40]. ` +
        `Either a scoring regression occurred or a new stable sub-axis was added ` +
        `and the band needs updating.`,
    ).toBeGreaterThanOrEqual(34);
    expect(score).toBeLessThanOrEqual(40);

    // --- audit scorer version (H4: explain --score surfaces the audit's
    // own scoringVersion, not a separately-pinned formula-v1 identity) ---
    expect(
      out,
      `Expected '${SCORING_V2_LEGACY}' in output — the audit's default v2-legacy scorer may not be active`,
    ).toContain(SCORING_V2_LEGACY);

    // --- Counted findings band ---
    const countedMatch = out.match(/Counted findings:\s*(\d+)/);
    expect(countedMatch, "Counted findings line not found in output").not.toBeNull();
    const counted = parseInt(countedMatch![1]!, 10);
    expect(
      counted,
      `Counted findings ${counted} is outside expected band [9, 13]. ` +
        `If 0, stableSubAxes may have silently gone empty (trivial 100 regression). ` +
        `If >13, new stable sub-axes were promoted without updating this band.`,
    ).toBeGreaterThanOrEqual(9);
    expect(counted).toBeLessThanOrEqual(13);
  });
});
