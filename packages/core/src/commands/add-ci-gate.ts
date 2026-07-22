// `lyse add ci-gate` — install the Lyse diff-first CI gate into the user's
// repo. Drops a single file:
//   .github/workflows/lyse.yml   (runs `lyse audit --scope new`, self-gates
//                                  via exit code against the committed
//                                  .lyse/baseline.json)
//
// The template is inlined as a string constant so we don't depend on a
// runtime templates/ folder being shipped intact through the npm publish
// pipeline. When the template changes, edit the constant below.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { posixRelative } from "../util/paths.js";
import { VERSION } from "../index.js";

export interface AddCiGateOptions {
  /** Repo root where the .github/ folder should land. */
  cwd: string;
  /** Override the default `npx --yes @lyse-labs/lyse@<v>` pin in the workflow. */
  lyseVersion?: string;
  /**
   * No-op in the diff-first gate (kept for back-compat with older callers /
   * `--threshold` CLI arg). The workflow now gates on `audit --scope new`
   * exiting non-zero, driven by the committed `.lyse/baseline.json` — there
   * is no score-drop threshold to configure. Still validated so pre-existing
   * scripts that pass a bad value fail the same way they used to.
   */
  threshold?: number;
  /** Overwrite existing files instead of refusing. */
  force?: boolean;
  /** Bypass the project-root check (.git/ or package.json). */
  forceNotARepo?: boolean;
}

export interface AddCiGateResult {
  written: string[];
  skipped: { path: string; reason: string }[];
}

export class AddCiGateError extends Error {}

// Matches the chars npm/semver versions and dist-tags use. Intentionally
// strict to keep the value safe to interpolate into a shell command in the
// generated workflow (defense in depth — the workflow does double-quote it).
const LYSE_VERSION_PATTERN = /^[\w.-]+$/;

export const CI_GATE_DEFAULTS = {
  // Default to the version of the CLI running this command. Pinning is
  // important because a moving tag like `@alpha` can update between CI runs,
  // producing non-comparable reports against the committed baseline.
  get lyseVersion(): string {
    return VERSION;
  },
  threshold: 0,
} as const;

export function runAddCiGate(opts: AddCiGateOptions): AddCiGateResult {
  const cwd = resolve(opts.cwd);
  if (!existsSync(cwd)) {
    throw new AddCiGateError(`Target directory does not exist: ${cwd}`);
  }

  if (opts.forceNotARepo !== true) {
    const hasGit = existsSync(join(cwd, ".git"));
    const hasPkg = existsSync(join(cwd, "package.json"));
    if (!hasGit && !hasPkg) {
      throw new AddCiGateError(
        `Target directory ${cwd} is not a project root (no .git/ or package.json found).\n` +
          `If this is intentional, pass --force-not-a-repo.`,
      );
    }
  }

  if (opts.lyseVersion !== undefined) {
    if (typeof opts.lyseVersion !== "string" || opts.lyseVersion.length === 0) {
      throw new AddCiGateError(`--lyse-version must be a non-empty string`);
    }
    if (!LYSE_VERSION_PATTERN.test(opts.lyseVersion)) {
      throw new AddCiGateError(
        `--lyse-version has an invalid format (got: ${JSON.stringify(opts.lyseVersion)}). ` +
          `Expected characters matching ${LYSE_VERSION_PATTERN} (e.g. "0.1.0-alpha.2", "alpha", "latest").`,
      );
    }
  }
  const lyseVersion = opts.lyseVersion ?? CI_GATE_DEFAULTS.lyseVersion;
  const threshold = opts.threshold ?? CI_GATE_DEFAULTS.threshold;
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new AddCiGateError(`--threshold must be a non-negative number (got: ${threshold})`);
  }

  const workflowPath = join(cwd, ".github/workflows/lyse.yml");
  const written: string[] = [];
  const skipped: { path: string; reason: string }[] = [];
  if (existsSync(workflowPath) && !opts.force) {
    skipped.push({ path: posixRelative(cwd, workflowPath), reason: "already exists (pass --force to overwrite)" });
  } else {
    mkdirSync(dirname(workflowPath), { recursive: true });
    writeFileSync(workflowPath, renderWorkflow({ lyseVersion }), "utf8");
    written.push(posixRelative(cwd, workflowPath));
  }
  return { written, skipped };
}

function renderWorkflow(args: { lyseVersion: string }): string {
  return WORKFLOW_TEMPLATE.replace(/__LYSE_VERSION__/g, args.lyseVersion);
}

// -----------------------------------------------------------------------------
// Template (inlined so it survives the npm publish pipeline cleanly)
// -----------------------------------------------------------------------------

const WORKFLOW_TEMPLATE = `name: Lyse audit

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

# Pin the Lyse CLI version so the gate is reproducible. Bump when you want CI
# to track a new alpha.
env:
  LYSE_VERSION: "__LYSE_VERSION__"

concurrency:
  group: lyse-gate-\${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: true

jobs:
  gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      # The committed .lyse/baseline.json is the accepted set. This gates the
      # job (exit 1) when the change introduces a new score-contributing
      # finding or regresses an adoption ratio. Regenerate with
      # \`lyse baseline write\` and commit when you intentionally accept new state.
      - name: Lyse diff gate
        run: npx --yes "@lyse-labs/lyse@\${{ env.LYSE_VERSION }}" audit --scope new
`;
