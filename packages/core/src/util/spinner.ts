/**
 * Minimal in-house spinner — issue #97.
 *
 * Why in-house? `ora` / `nanospinner` / `cli-spinners` would each pull a small
 * dep tree we don't need. The full spec for an audit-time spinner is a redraw
 * loop + ANSI cursor codes — well under 100 LOC. picocolors (already a dep)
 * handles color.
 *
 * Design contract:
 *   - Always writes to stderr by default. stdout is reserved for the audit
 *     JSON / SARIF payload; the spinner must never contaminate it.
 *   - No-op when `enabled` is false OR `isTTY` is false. Callers can pass the
 *     spinner unconditionally; suppression logic lives here.
 *   - On `start()` we hide the cursor and install signal handlers so a
 *     ^C-killed audit doesn't leave the terminal in a cursor-hidden state.
 *   - On `succeed()` / `fail()` / `stop()` we clear the spinner line first,
 *     then optionally write the final state (succeed/fail). The final line
 *     persists; the in-progress frame does not.
 */

import pc from "picocolors";

export interface SpinnerOptions {
  /** Whether the destination stream is a TTY. */
  isTTY: boolean;
  /** Master switch — false means no-op (used for --quiet, JSON/SARIF, etc.). */
  enabled: boolean;
  /** Destination stream (default: process.stderr). */
  stream?: NodeJS.WriteStream;
  /**
   * Whether to emit ANSI color codes. Cursor + clear-line codes are emitted
   * regardless because they're what makes the spinner visible. Default:
   * `isTTY && NO_COLOR` is unset.
   */
  color?: boolean;
}

export interface Spinner {
  start(label: string): void;
  update(label: string): void;
  succeed(label: string): void;
  fail(label: string): void;
  stop(): void;
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
const FRAME_MS = 80;

// ANSI control sequences kept inline for readability.
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const CLEAR_LINE = "\r\x1b[K";

function noopSpinner(): Spinner {
  return {
    start: () => {},
    update: () => {},
    succeed: () => {},
    fail: () => {},
    stop: () => {},
  };
}

export function createSpinner(opts: SpinnerOptions): Spinner {
  if (!opts.enabled || !opts.isTTY) return noopSpinner();

  const stream = opts.stream ?? process.stderr;
  const noColorEnv = typeof process.env["NO_COLOR"] === "string" && process.env["NO_COLOR"] !== "";
  const color = opts.color ?? (opts.isTTY && !noColorEnv);

  let label = "";
  let frameIdx = 0;
  let interval: NodeJS.Timeout | null = null;
  let active = false;

  const colorFrame = (frame: string): string => (color ? pc.cyan(frame) : frame);
  const colorSuccess = (s: string): string => (color ? pc.green(s) : s);
  const colorFail = (s: string): string => (color ? pc.red(s) : s);

  const writeFrame = (): void => {
    const frame = FRAMES[frameIdx % FRAMES.length] ?? FRAMES[0];
    stream.write(`${CLEAR_LINE}${colorFrame(frame)} ${label}`);
    frameIdx = (frameIdx + 1) % FRAMES.length;
  };

  const clearLine = (): void => {
    stream.write(CLEAR_LINE);
  };

  // Restore terminal state on process exit / signal. Without this, a Ctrl-C
  // during audit leaves the terminal with a hidden cursor — surprising and
  // requires a `reset` to recover.
  const restore = (): void => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    if (active) {
      stream.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
      active = false;
    }
  };
  // Best-effort: only register once per process. We can't fully scope these
  // to the spinner instance because Node fires them on the whole process.
  const onSignal = (): void => {
    restore();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.once("exit", restore);

  return {
    start(initialLabel: string) {
      // Multiple start() calls without stop() — clear the previous line so we
      // don't accumulate orphan frames.
      if (active) {
        clearLine();
      }
      label = initialLabel;
      frameIdx = 0;
      active = true;
      stream.write(HIDE_CURSOR);
      writeFrame();
      interval = setInterval(writeFrame, FRAME_MS);
      if (typeof interval.unref === "function") interval.unref();
    },
    update(nextLabel: string) {
      if (!active) {
        // update() without start() — treat as start() for resilience.
        this.start(nextLabel);
        return;
      }
      label = nextLabel;
      writeFrame();
    },
    succeed(finalLabel: string) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      clearLine();
      stream.write(`${colorSuccess("✔")} ${finalLabel}\n${SHOW_CURSOR}`);
      active = false;
    },
    fail(finalLabel: string) {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      clearLine();
      stream.write(`${colorFail("✗")} ${finalLabel}\n${SHOW_CURSOR}`);
      active = false;
    },
    stop() {
      restore();
    },
  };
}
