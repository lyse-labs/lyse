/**
 * Track 8.10 — First Trusted Score smoke test.
 *
 * Pins the Health Score produced by `lyse explain --score` against the
 * full-ds fixture so that a scoring regression turns CI red.
 *
 * Bands (not exact pins) so small noise deltas don't create false positives:
 *   - Health Score:       N ∈ [85, 91]  (±3 around 88)
 *   - Counted findings:   M ∈ [4,  6]   (guards against stableSubAxes going empty → trivial 100)
 *   - Scoring path:       "scoring-v1"  (trusted-score path is active)
 *
 * Band history: started [90,96]/[2,4] with 7 stable sub-axes. The 8th scored
 * sub-axis `tokens.theme-modes` (#127) fires on full-ds (it declares no
 * light/dark mode signal), adding one counted finding → score 91→88.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = join(__dirname, "../fixtures/full-ds");

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, "");
}

describe("cli explain --score smoke (Track 8.10)", () => {
  it("Health Score is within [85, 91] and scoring-v1 is active", { timeout: 30_000 }, () => {
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
      `Health Score ${score} is outside expected band [85, 91]. ` +
        `Either a scoring regression occurred or a new stable sub-axis was added ` +
        `and the band needs updating.`,
    ).toBeGreaterThanOrEqual(85);
    expect(score).toBeLessThanOrEqual(91);

    // --- scoring-v1 path ---
    expect(out, "Expected 'scoring-v1' in output — trusted-score path may not be active").toContain(
      "scoring-v1",
    );

    // --- Counted findings band ---
    const countedMatch = out.match(/Counted findings:\s*(\d+)/);
    expect(countedMatch, "Counted findings line not found in output").not.toBeNull();
    const counted = parseInt(countedMatch![1]!, 10);
    expect(
      counted,
      `Counted findings ${counted} is outside expected band [4, 6]. ` +
        `If 0, stableSubAxes may have silently gone empty (trivial 100 regression). ` +
        `If >6, new stable sub-axes were promoted without updating this band.`,
    ).toBeGreaterThanOrEqual(4);
    expect(counted).toBeLessThanOrEqual(6);
  });
});
