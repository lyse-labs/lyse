import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runAuditTest, LYSE_CLI_PATH } from "./_helpers/cli.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// A near-empty repo: what is under test is argument validation, which happens
// before any audit work. Auditing `fixtures/full-ds` eight times over costs
// ~12s per spawn and blew the 15s default timeout in CI; this costs ~1.5s.
let tiny: string;
beforeAll(() => {
  tiny = mkdtempSync(join(tmpdir(), "lyse-enum-flags-"));
  writeFileSync(
    join(tiny, "package.json"),
    JSON.stringify({ name: "tiny", version: "1.0.0", private: true }),
  );
});
afterAll(() => {
  rmSync(tiny, { recursive: true, force: true });
});

/**
 * #276. `--scope New` audited the whole tree, never reached `evaluateGate`,
 * and exited 0 — a one-character typo in a workflow file turning a red CI gate
 * green with no signal. `--format` had the same hole: an unrecognised value
 * fell through to the JSON branch, so `--format=Sarif --output d` wrote
 * `d/lyse.json` and exited 0.
 */
describe("audit rejects an unaccepted enum value (#276)", () => {
  for (const scope of ["New", "NEW", "nw", "scope-typo"]) {
    it(`exits 64 on --scope=${scope}`, () => {
      const r = runAuditTest({ path: tiny, extraArgs: [`--scope=${scope}`] });
      expect(r.status).toBe(64);
      expect(r.stderr).toMatch(/invalid value --scope=/);
      expect(r.stderr).toMatch(/changed, staged, uncommitted, new/);
    });
  }

  it("suggests the right spelling when only the case is wrong", () => {
    const r = runAuditTest({ path: tiny, extraArgs: ["--scope=New"] });
    expect(r.stderr).toMatch(/did you mean `new`/);
  });

  for (const format of ["Sarif", "sarrif", "html5"]) {
    it(`exits 64 on --format=${format}`, () => {
      const r = runAuditTest({ path: tiny, extraArgs: [`--format=${format}`] });
      expect(r.status).toBe(64);
      expect(r.stderr).toMatch(/invalid value --format=/);
    });
  }

  // Asserted on the message, not the status: `--scope=new` legitimately exits
  // 64 here because there is no committed baseline. Both refusals share an exit
  // code, only one of them is this validator.
  it.each(["changed", "staged", "uncommitted", "new"])(
    "still accepts --scope=%s",
    (scope) => {
      const r = runAuditTest({ path: tiny, extraArgs: [`--scope=${scope}`] });
      expect(r.stderr, `--scope=${scope} rejected by the enum validator`).not.toMatch(
        /invalid value --scope=/,
      );
    },
  );

  it.each(["json", "text", "table", "tsv", "eslint", "legacy", "sarif", "html"])(
    "still accepts --format=%s",
    (format) => {
      const r = runAuditTest({ path: tiny, extraArgs: [`--format=${format}`] });
      expect(r.status, `--format=${format} rejected as a usage error`).not.toBe(64);
    },
  );
});

describe("explain rejects an unaccepted --format (#276)", () => {
  const run = (args: string[]) =>
    spawnSync("node", [LYSE_CLI_PATH, ...args], { encoding: "utf8", env: { ...process.env } });

  it("exits 64 on a format it does not implement", () => {
    const r = run(["explain", "tokens/no-hardcoded-color", "--format=markdown"]);
    expect(r.status).toBe(64);
    expect(r.stderr).toMatch(/invalid value --format=markdown/);
  });

  it("still accepts text and md", () => {
    for (const format of ["text", "md"]) {
      const r = run(["explain", "tokens/no-hardcoded-color", `--format=${format}`]);
      expect(r.status, `--format=${format} rejected`).toBe(0);
    }
  });
});
