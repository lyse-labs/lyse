import { spawn } from "node:child_process";
import { TIMEOUT_EXIT_CODE, timeoutNotice } from "./timeout.js";
import type { Transcript } from "./transcript.js";

/** Grace period between SIGTERM and SIGKILL, so the agent can unwind. */
const KILL_GRACE_MS = 5_000;

export interface GuardOptions {
  /** Milliseconds before the child is terminated; `null` waits indefinitely. */
  timeoutMs: number | null;
  log: Transcript;
}

/**
 * Spawn a coding agent, tee its output, and bound how long it may run.
 *
 * stdin stays inherited so `--review` mode can still prompt. stdout and stderr
 * are piped and teed to the terminal and the transcript, because the default
 * mode disables the agent's permission prompts and nothing else records what it
 * did.
 *
 * On timeout the child gets SIGTERM, then SIGKILL after a grace period, and the
 * promise resolves with {@link TIMEOUT_EXIT_CODE} rather than waiting for a
 * close event that may never arrive. Edits already written to the working tree
 * are deliberately left in place — this bounds the run, it does not roll it
 * back; the notice says so.
 */
export function spawnGuarded(
  binary: string,
  args: readonly string[],
  cwd: string,
  opts: GuardOptions,
): Promise<number> {
  return new Promise<number>((resolve) => {
    const proc = spawn(binary, [...args], { stdio: ["inherit", "pipe", "pipe"], cwd });

    let settled = false;
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    let killTimer: NodeJS.Timeout | undefined;
    // Once the deadline passes, every exit is a timeout however the child ends:
    // SIGTERM produces a `close` with a null code, and the generic handler below
    // is registered first, so without this the promise would resolve 1 and the
    // caller could not tell a hang from an ordinary failure.
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (killTimer !== undefined) clearTimeout(killTimer);
      resolve(timedOut ? TIMEOUT_EXIT_CODE : code);
    };

    const tee = (from: NodeJS.ReadableStream | null, to: NodeJS.WriteStream) => {
      from?.on("data", (chunk: Buffer) => {
        to.write(chunk);
        opts.log.write(chunk);
      });
    };
    tee(proc.stdout, process.stdout);
    tee(proc.stderr, process.stderr);

    if (opts.timeoutMs !== null) {
      const limit = opts.timeoutMs;
      timer = setTimeout(() => {
        timedOut = true;
        const notice = timeoutNotice(limit);
        process.stderr.write(notice);
        opts.log.write(notice);
        proc.kill("SIGTERM");
        // A child that ignores SIGTERM would otherwise keep the handoff open
        // exactly as before, which is the failure this guard exists to end.
        killTimer = setTimeout(() => {
          proc.kill("SIGKILL");
          finish(TIMEOUT_EXIT_CODE);
        }, KILL_GRACE_MS);
      }, limit);
    }

    proc.on("error", () => finish(1));
    proc.on("close", (code) => finish(code ?? 1));
  });
}
