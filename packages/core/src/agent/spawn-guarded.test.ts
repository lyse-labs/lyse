import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { spawnGuarded } from "./spawn-guarded.js";
import { TIMEOUT_EXIT_CODE } from "./timeout.js";
import { openTranscript, transcriptPath } from "./transcript.js";

const NODE = process.execPath;

function freshTranscript(): { path: string; log: ReturnType<typeof openTranscript> } {
  const root = mkdtempSync(join(tmpdir(), "lyse-guarded-"));
  const path = transcriptPath(root);
  return { path, log: openTranscript(path) };
}

describe("spawnGuarded", () => {
  it("returns the child's exit code when it finishes in time", async () => {
    const { log } = freshTranscript();
    const code = await spawnGuarded(NODE, ["-e", "process.exit(3)"], process.cwd(), {
      timeoutMs: 30_000,
      log,
    });
    await log.close();
    expect(code).toBe(3);
  }, 20_000);

  it("kills a child that never exits, and reports 124", async () => {
    // The defect this guards: spawnAgentLauncher resolved only on `close`, so an
    // agent that hangs held the handoff open forever. Interactively a human hits
    // Ctrl-C; unattended it is a silent stall on a process started with its
    // permission prompts disabled.
    const { path, log } = freshTranscript();
    const started = Date.now();
    const code = await spawnGuarded(NODE, ["-e", "setInterval(() => {}, 1000)"], process.cwd(), {
      timeoutMs: 400,
      log,
    });
    await log.close();
    expect(code).toBe(TIMEOUT_EXIT_CODE);
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(readFileSync(path, "utf8")).toContain("timed out");
  }, 30_000);

  it("waits indefinitely when the timeout is opted out, and still returns normally", async () => {
    const { log } = freshTranscript();
    const code = await spawnGuarded(NODE, ["-e", "process.exit(0)"], process.cwd(), {
      timeoutMs: null,
      log,
    });
    await log.close();
    expect(code).toBe(0);
  }, 20_000);

  it("returns 1 when the binary does not exist rather than hanging on the timeout", async () => {
    const { log } = freshTranscript();
    const code = await spawnGuarded("lyse-no-such-binary-xyz", [], process.cwd(), {
      timeoutMs: 30_000,
      log,
    });
    await log.close();
    expect(code).toBe(1);
  }, 20_000);

  it("tees the child's output to the transcript", async () => {
    const { path, log } = freshTranscript();
    await spawnGuarded(NODE, ["-e", "console.log('edited Button.tsx')"], process.cwd(), {
      timeoutMs: 30_000,
      log,
    });
    await log.close();
    expect(readFileSync(path, "utf8")).toContain("edited Button.tsx");
  }, 20_000);
});
