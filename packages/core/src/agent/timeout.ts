/**
 * How long `lyse handoff` waits for the agent it spawned before killing it.
 *
 * `spawnAgentLauncher` resolves when the child closes, and nothing else bounds
 * it — so an agent that hangs (a prompt nobody answers, a network call with no
 * deadline, a runaway loop) holds the handoff open forever. Interactively that
 * is visible and a human hits Ctrl-C. Unattended it is a silent stall on a
 * process that was started with its permission prompts disabled, which is the
 * one shape of failure an overnight run cannot recover from on its own.
 */
export const DEFAULT_HANDOFF_TIMEOUT_MS = 30 * 60 * 1000;

/** GNU coreutils `timeout` uses 124; callers already read it as "timed out". */
export const TIMEOUT_EXIT_CODE = 124;

/**
 * `LYSE_HANDOFF_TIMEOUT_MS` in milliseconds. `0` opts out entirely (a human
 * watching the terminal may want that). Anything unparseable falls back to the
 * default rather than to no timeout — a typo must not silently remove the only
 * thing bounding an unattended run.
 */
export function resolveTimeoutMs(env: Record<string, string | undefined>): number | null {
  const raw = env["LYSE_HANDOFF_TIMEOUT_MS"];
  if (raw === undefined) return DEFAULT_HANDOFF_TIMEOUT_MS;
  if (!/^\d+$/.test(raw.trim())) return DEFAULT_HANDOFF_TIMEOUT_MS;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed)) return DEFAULT_HANDOFF_TIMEOUT_MS;
  return parsed === 0 ? null : parsed;
}

function humanise(ms: number): string {
  if (ms >= 60_000) {
    const minutes = Math.round(ms / 60_000);
    return `${minutes}m`;
  }
  return `${Math.round(ms / 1000)}s`;
}

/** Written to the transcript and to stderr, so a stalled run explains itself. */
export function timeoutNotice(ms: number): string {
  return (
    `\n[lyse] handoff timed out after ${humanise(ms)} — the agent was terminated. ` +
    `Any edits it had already written to the working tree are still there; review them with git. ` +
    `Set LYSE_HANDOFF_TIMEOUT_MS to change the limit, or 0 to wait indefinitely.\n`
  );
}
