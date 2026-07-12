import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { LYSE_CLI_PATH } from "./_helpers/cli.js";

const cli = LYSE_CLI_PATH;

function runCli(args: string[], opts: { env?: NodeJS.ProcessEnv } = {}): ReturnType<typeof spawnSync> {
  // citty routes its built-in --help through consola, which silently drops
  // output when CI=true. Vitest sets CI=true in worker envs, so strip it for
  // these tests. The non-TTY signal still comes from stdio: pipe.
  const env: NodeJS.ProcessEnv = { ...process.env, ...(opts.env ?? {}) };
  delete env.CI;
  return spawnSync("node", [cli, ...args], {
    encoding: "utf8",
    timeout: 10_000,
    // Pipe stdin so the process never receives a TTY → isInteractive() is
    // false → the bare command must skip the audit delegation and fall
    // through to help.
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });
}

describe("cli root command (bare-command wiring)", () => {
  if (!existsSync(cli)) {
    it.skip("CLI not built — skip", () => {});
    return;
  }

  it("`lyse --help` exits cleanly and does not hang on a prompt", () => {
    // citty's built-in --help routes through consola, which is silenced when
    // common CI env vars are present — so we cannot assert on stdout content
    // here. The 10s timeout proves no menu prompt blocked the process, and
    // exit=0 + no 'Unknown option' on stderr proves --help is honored.
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("`lyse audit --help` still works — subcommand bypasses the menu", () => {
    const r = runCli(["audit", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/[Uu]nknown/);
  });

  it("`lyse version` still works — subcommand bypasses the menu", () => {
    const r = runCli(["version"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^lyse \S+/m);
    expect(r.stdout).toMatch(/^rules /m);
  });

  it("`lyse` with no args in non-TTY mode shows help instead of hanging on a prompt", () => {
    // Test environment has no TTY → isInteractive() returns false → root.run()
    // must fall through to showUsage(), NOT delegate to the audit command.
    // The 10s timeout catches a regression where something would block
    // waiting for stdin.
    const r = runCli([]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("USAGE");
    expect(r.stdout).toContain("Audit your design system");
  });
});
