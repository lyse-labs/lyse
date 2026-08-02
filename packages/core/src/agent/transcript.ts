import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Where `lyse handoff` records the output of the agent it spawned.
 *
 * `handoff` launches a coding agent with its permission prompts disabled
 * (`--dangerously-skip-permissions` / `--yolo` / `--force`) and lets it edit
 * the working tree. Under `stdio: "inherit"` that output went to the terminal
 * and nowhere else, so once the session ended nothing recorded which files the
 * agent had touched. An action nobody can review afterwards is not reviewed.
 */
export function transcriptPath(cwd: string): string {
  return join(cwd, ".lyse", "handoff", "agent-transcript.log");
}

export interface Transcript {
  write(chunk: Buffer | string): void;
  /** Resolves once the file is flushed and closed, so callers may read it back. */
  close(): Promise<void>;
}

/**
 * Opens the transcript, truncating any previous run. Recording is best-effort:
 * a handoff that cannot write its log still runs, because failing the user's
 * fix over an unwritable log file trades a real capability for a record.
 */
export function openTranscript(path: string): Transcript {
  let stream: WriteStream | null = null;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const opened = createWriteStream(path, { flags: "w" });
    opened.on("error", () => {
      stream = null;
    });
    stream = opened;
  } catch {
    stream = null;
  }
  return {
    write(chunk) {
      try {
        stream?.write(chunk);
      } catch {
        /* best effort */
      }
    },
    close() {
      const open = stream;
      if (open === null) return Promise.resolve();
      return new Promise<void>((resolve) => {
        open.on("close", () => resolve());
        open.on("error", () => resolve());
        try {
          open.end();
        } catch {
          resolve();
        }
      });
    },
  };
}
