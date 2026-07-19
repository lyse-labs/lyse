/**
 * `lyse handoff --review` CLI wiring: the flag must be accepted (not
 * "unknown option") and documented in `--help`.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cli = join(__dirname, "../dist/cli.js");

describe("lyse handoff --review", () => {
  it("is accepted on `lyse handoff --help` without an 'unknown option' error", () => {
    const r = spawnSync("node", [cli, "handoff", "--review", "--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("is documented in `lyse handoff --help` output", () => {
    const r = spawnSync("node", [cli, "handoff", "--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("--review");
  });

  it("is also accepted on the deprecated `lyse fix` alias", () => {
    const r = spawnSync("node", [cli, "fix", "--review", "--help"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });
});
