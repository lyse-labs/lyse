import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { transcriptPath, openTranscript } from "./transcript.js";

describe("transcriptPath", () => {
  it("sits beside the handoff payload, under the audited repo", () => {
    expect(transcriptPath("/repo")).toBe(join("/repo", ".lyse", "handoff", "agent-transcript.log"));
  });
});

describe("openTranscript", () => {
  it("creates the directory and records what was written", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-transcript-"));
    const path = transcriptPath(root);
    const t = openTranscript(path);
    t.write("edited Button.tsx\n");
    t.write(Buffer.from("edited Card.tsx\n"));
    await t.close();
    const body = readFileSync(path, "utf8");
    expect(body).toContain("edited Button.tsx");
    expect(body).toContain("edited Card.tsx");
  });

  it("truncates a previous run rather than appending to it", async () => {
    const root = mkdtempSync(join(tmpdir(), "lyse-transcript-"));
    const path = transcriptPath(root);
    const first = openTranscript(path);
    first.write("run one\n");
    await first.close();
    const second = openTranscript(path);
    second.write("run two\n");
    await second.close();
    const body = readFileSync(path, "utf8");
    expect(body).toContain("run two");
    expect(body).not.toContain("run one");
  });

  it("never throws when the path is unwritable — a failed recording must not kill the handoff", async () => {
    // A path whose parent is a FILE, not a directory: mkdirSync fails with
    // ENOTDIR regardless of privileges. Pointing at an unwritable system
    // directory instead would pass as a normal user and fail as root.
    const root = mkdtempSync(join(tmpdir(), "lyse-transcript-"));
    const blocker = join(root, "blocker");
    writeFileSync(blocker, "not a directory");
    const path = join(blocker, "handoff", "agent-transcript.log");
    const t = openTranscript(path);
    expect(() => t.write("x")).not.toThrow();
    await expect(t.close()).resolves.toBeUndefined();
    expect(existsSync(path)).toBe(false);
  });
});
