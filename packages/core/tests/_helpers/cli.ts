/**
 * Test helper for spawning `lyse audit` as a CLI subprocess.
 *
 * Defaults to `--static-only` because the vast majority of CLI integration
 * tests verify CLI behavior (exit codes, output formats, SARIF, etc.) — not
 * LLM behavior. Pass `staticOnly: false` to opt into the Layer 4 path
 * (requires an LLM connector set up in the test env).
 *
 * Centralized so:
 *  - Future tests can't accidentally forget --static-only and hit RefuseToRunError
 *  - The dist/cli.js path resolution lives in one place
 *  - Common env scrubbing (CI=1 for deterministic runs) is consistent
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, "../../dist/cli.js");

export interface RunAuditTestOptions {
  /** Path to the repo under test. */
  path: string;
  /** Output format. Defaults to "text". */
  format?: "text" | "json" | "sarif";
  /** Whether to pass --static-only. Defaults to true (CLI tests typically don't need Layer 4). */
  staticOnly?: boolean;
  /** Additional CLI args (e.g. --threshold=50). */
  extraArgs?: string[];
  /** Environment overrides. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Spawn `node dist/cli.js audit <path> ...` and return the raw result.
 * Caller asserts on r.status / r.stdout / r.stderr.
 */
export function runAuditTest(opts: RunAuditTestOptions): SpawnSyncReturns<string> {
  const args = ["audit", opts.path];
  if (opts.format) args.push(`--format=${opts.format}`);
  if (opts.staticOnly !== false) args.push("--static-only");
  if (opts.extraArgs) args.push(...opts.extraArgs);
  return spawnSync("node", [CLI_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...opts.env },
  });
}

/**
 * Path to the built CLI. Exposed for tests that need to spawn other
 * `lyse` subcommands (e.g. agents, init, ci, mcp).
 */
export const LYSE_CLI_PATH = CLI_PATH;
