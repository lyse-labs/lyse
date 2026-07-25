/**
 * End-to-end proof of the `--llm-frozen` / `--llm-refresh` chain: filter
 * stage (verdict cache) → audit pipeline meta (`result.meta.layer4.frozenMisses`)
 * → CLI non-zero exit + message. See task-4-brief.md.
 *
 * `LYSE_DISABLE_AGENT_AUTODETECT=1` pins the connector to Noop in every case
 * here so no real LLM subprocess is ever spawned — hermetic regardless of
 * whether `claude` is on PATH. The frozen path short-circuits before the
 * connector is even called, but this keeps the other cases safe too.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditTest } from "./_helpers/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// full-ds's src/Page.tsx has `style={{ background: "#2563eb", padding: "7px" }}`
// — a confirmed live `tokens/no-hardcoded-color` + `tokens/no-hardcoded-spacing`
// pair (verified with a static-only JSON audit while writing this test). The
// fixture ships with no `.lyse/verdicts.json`, so both are cache misses.
const fullDs = join(__dirname, "../fixtures/full-ds");

const NOOP_ENV = { LYSE_DISABLE_AGENT_AUTODETECT: "1" };

function cleanFixtureRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-frozen-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t" }));
  // No inline styles / hardcoded values at all → no target findings, so the
  // filter stage never partitions anything into misses.
  writeFileSync(
    join(dir, "Page.tsx"),
    "export const Page = () => <div className=\"card\">hello</div>;\n",
  );
  return dir;
}

describe("cli --llm-frozen / --llm-refresh (#verdict-cache Task 4)", () => {
  it("declares --llm-frozen and --llm-refresh (not silently ignored typos)", () => {
    const help = runAuditTest({ path: fullDs, extraArgs: ["--help"] });
    expect(help.stdout).toContain("--llm-frozen");
    expect(help.stdout).toContain("--llm-refresh");
  });

  it("frozen miss on an uncached finding exits non-zero with the replay message (end-to-end)", () => {
    const r = runAuditTest({
      path: fullDs,
      staticOnly: false,
      extraArgs: ["--llm", "--llm-frozen"],
      env: NOOP_ENV,
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("verdict cache");
    expect(r.stderr).toContain("commit .lyse/verdicts.json");
  });

  it("--llm-refresh parses and does not trip a frozen failure (no cache miss gate)", () => {
    const r = runAuditTest({
      path: fullDs,
      staticOnly: false,
      extraArgs: ["--llm", "--llm-refresh"],
      env: NOOP_ENV,
    });

    expect(r.stderr).not.toMatch(/unknown option/i);
    expect(r.status).toBe(0);
  });

  it("--llm-frozen on a repo with no target findings exits 0 (no misses → no frozen failure)", () => {
    const dir = cleanFixtureRepo();
    try {
      const r = runAuditTest({
        path: dir,
        staticOnly: false,
        extraArgs: ["--llm", "--llm-frozen"],
        env: NOOP_ENV,
      });

      expect(r.stderr).not.toContain("verdict cache");
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
