/**
 * Regression test for the `explain --score <path>` positional.
 *
 * Before the fix, `explain --score` always audited `process.cwd()` and silently
 * ignored any path argument — so `lyse explain --score ./some-ds` scored the
 * current directory instead of the target, and the First Trusted Score smoke
 * test was auditing its own cwd rather than the fixture it passed.
 *
 * This test pins the contract: two different target paths must yield two
 * different score breakdowns, proving the path argument is honored.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { LYSE_CLI_PATH } from "./_helpers/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fullDs = join(__dirname, "../fixtures/full-ds");

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1B\[[0-9;]*m/g, "");
}

function breakdownOf(path: string): string {
  // Pin v2 so both targets yield a numeric Health Score line. Under the default
  // v3 model these small repos are below min-N=30 → "N/A"; this test is about
  // the <path> positional (distinct targets → distinct breakdowns), not the
  // score model, so it scores against the numeric v2 formula.
  const r = spawnSync(
    "node",
    [LYSE_CLI_PATH, "explain", "--score", "--static-only", "--score-model", "v2", path],
    { encoding: "utf8" },
  );
  expect(r.status, `explain --score exited non-zero:\n${r.stderr}`).toBe(0);
  const out = stripAnsi(r.stdout);
  expect(out, "Health Score line not found").toMatch(/Health Score:\s*\d+\s*\/\s*100/);
  return out;
}

describe("cli explain --score <path> honors the path argument", () => {
  it("audits the passed path, not the current working directory", { timeout: 30_000 }, () => {
    if (!existsSync(LYSE_CLI_PATH)) {
      throw new Error(`CLI not built — run \`pnpm --filter lyse build\` first. Looked at: ${LYSE_CLI_PATH}`);
    }

    // A minimal, near-pristine repo: a package.json with a valid version and
    // a structured CHANGELOG, so the versioning rules pass there. It is a
    // different target than full-ds, so its breakdown must differ.
    const tmp = mkdtempSync(join(tmpdir(), "lyse-explain-path-"));
    try {
      writeFileSync(join(tmp, "package.json"), JSON.stringify({ name: "tmp-ds", version: "1.0.0" }));
      writeFileSync(join(tmp, "CHANGELOG.md"), "# Changelog\n\n## [1.0.0] - 2026-01-01\n- init\n");

      const a = breakdownOf(fullDs);
      const b = breakdownOf(tmp);

      // Distinct targets → distinct breakdowns (different sub-axis lists).
      // Before the fix both audited the shared cwd and were byte-identical.
      expect(a).not.toBe(b);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
