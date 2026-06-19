// Guard 6 of `lyse fix`: non-TTY contexts default to --dry-run so a piped or
// CI invocation never mutates and commits the repo unattended. An explicit
// `--dry-run` / `--no-dry-run` flag is always honored; only the *absence* of a
// flag falls back to the TTY heuristic.
export function resolveDryRun(params: { flagPresent: boolean; flagValue: boolean; isTTY: boolean }): boolean {
  if (params.flagPresent) return params.flagValue;
  return !params.isTTY;
}

// True if the user wrote any form of the dry-run flag on the command line, so
// we can tell an explicit `--no-dry-run` (write) apart from the parser default.
export function dryRunFlagPresent(argv: readonly string[]): boolean {
  return argv.some(
    (a) => a === "--dry-run" || a === "--no-dry-run" || a.startsWith("--dry-run="),
  );
}
