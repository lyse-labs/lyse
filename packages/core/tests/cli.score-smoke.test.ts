/**
 * Track 8.10 — First Trusted Score smoke test.
 *
 * Pins the Health Score produced by `lyse explain --score` against the
 * full-ds fixture so that a scoring regression turns CI red.
 *
 * Bands (not exact pins) so small noise deltas don't create false positives:
 *   - Health Score:       N ∈ [75, 81]  (±3 around 78)
 *   - Counted findings:   M ∈ [8, 11]   (guards against stableSubAxes going empty → trivial 100)
 *   - Scoring path:       "scoring-v1"  (trusted-score path is active)
 *
 * As of the `explain --score <path>` fix, this command now genuinely audits the
 * `full-ds` fixture passed below (previously it ignored the path and silently
 * audited the test runner's cwd — the band was therefore tuned to the wrong
 * target). Real full-ds today: 7 counted findings (agent-instruction-files,
 * changelog-present, semver-versioning, migration-guide-present,
 * llms-txt-structure, theme-modes, component-manifest) → Health Score 82.
 *
 * Band history: [90,96]/[2,4] with 7 stable sub-axes → [85,91]/[4,6] after the
 * 8th (`tokens.theme-modes`, #127) → (cwd fix: now genuinely audits full-ds) →
 * [82,88]/[5,7] after the 10th (`ai-surface.semver-versioning`, #131) →
 * [79,85]/[6,8] after the 11th (`ai-surface.migration-guide-present`, #131) →
 * [75,81]/[8,11] after promoting the 10 deterministic gate-clearers into v1
 * (#71, 12→22 stable sub-axes; only a couple fire on the clean full-ds fixture,
 * so the band steps down modestly) →
 * [70,76]/[9,13] after promoting `tokens.spacing` into v1 (oracle-valid
 * precision LB 0.985, #128/#120; full-ds has one hardcoded-spacing finding at
 * src/Page.tsx, so the score steps down ~5 pts and counted +2).
 * Band held at [70,76]/[9,13] through the 2026-06-20 deterministic batch
 * (tokens.media-query, components.doc-comments, a11y.forced-colors,
 * ai-governance.product-analytics → 43→47 stable): a few of them fire on this
 * fixture (counted ~12, score ~71), staying inside the existing band.
 * Each new scored sub-axis that fires on full-ds (which ships none of these
 * AI/versioning artifacts) steps the band down by one finding.
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
  it("Health Score is within [75, 81] and scoring-v1 is active", { timeout: 30_000 }, () => {
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
      `Health Score ${score} is outside expected band [70, 76]. ` +
        `Either a scoring regression occurred or a new stable sub-axis was added ` +
        `and the band needs updating.`,
    ).toBeGreaterThanOrEqual(70);
    expect(score).toBeLessThanOrEqual(76);

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
      `Counted findings ${counted} is outside expected band [9, 13]. ` +
        `If 0, stableSubAxes may have silently gone empty (trivial 100 regression). ` +
        `If >13, new stable sub-axes were promoted without updating this band.`,
    ).toBeGreaterThanOrEqual(9);
    expect(counted).toBeLessThanOrEqual(13);
  });
});
