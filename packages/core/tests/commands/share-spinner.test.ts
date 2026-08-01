import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../../src/share/clipboard.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/share/clipboard.js")>("../../src/share/clipboard.js");
  return { ...actual, copyToClipboard: vi.fn().mockResolvedValue(undefined) };
});

// Layer 4 mocks (mirror audit-spinner.test.ts).
vi.mock("../../src/llm/connectors/index.js", () => ({ resolveConnector: vi.fn().mockResolvedValue(null) }));
vi.mock("../../src/llm/sampler.js", () => ({ sampleForAudit: vi.fn().mockResolvedValue({ files: [], totalBytes: 0 }) }));
vi.mock("../../src/util/git.js", () => ({
  gitHeadSha: vi.fn().mockResolvedValue("no-git"),
  modifiedFilesWithHashes: vi.fn().mockResolvedValue([]),
}));

import { runShare } from "../../src/commands/share.js";

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "lyse-share-spinner-"));
  writeFileSync(join(dir, "package.json"), '{"name":"x","dependencies":{"react":"18"}}');
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "A.tsx"), 'const x = <div style={{ color: "#fff" }} />;');
  return dir;
}

describe("runShare: spinner integration", () => {
  it("emits a success line containing the score when enabled", async () => {
    const dir = makeFixture();
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      writes.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    }) as typeof process.stderr.write;
    const origIsTTY = process.stderr.isTTY;
    (process.stderr as { isTTY?: boolean }).isTTY = true;
    try {
      await runShare(dir, { quiet: false });
    } finally {
      process.stderr.write = origWrite;
      (process.stderr as { isTTY?: boolean }).isTTY = origIsTTY;
    }
    const all = writes.join("");
    expect(all).toMatch(/Summary copied/);
    // Default model is v3; this tiny fixture is below min-N=30 on every axis, so
    // the success line shows "score N/A/100". Accept a number or N/A — the test
    // asserts the score is surfaced, not its magnitude.
    expect(all).toMatch(/score (\d+|N\/A)\/100/);
  });

  it("is silent when quiet=true (no spinner output)", async () => {
    const dir = makeFixture();
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      writes.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    }) as typeof process.stderr.write;
    const origIsTTY = process.stderr.isTTY;
    (process.stderr as { isTTY?: boolean }).isTTY = true;
    try {
      await runShare(dir, { quiet: true });
    } finally {
      process.stderr.write = origWrite;
      (process.stderr as { isTTY?: boolean }).isTTY = origIsTTY;
    }
    const all = writes.join("");
    expect(all).not.toMatch(/Discovering files/);
    expect(all).not.toMatch(/Summary copied/);
  });

  it("is silent when stderr is not a TTY", async () => {
    const dir = makeFixture();
    const writes: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: unknown) => {
      writes.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    }) as typeof process.stderr.write;
    const origIsTTY = process.stderr.isTTY;
    (process.stderr as { isTTY?: boolean }).isTTY = false;
    try {
      await runShare(dir, { quiet: false });
    } finally {
      process.stderr.write = origWrite;
      (process.stderr as { isTTY?: boolean }).isTTY = origIsTTY;
    }
    const all = writes.join("");
    expect(all).not.toMatch(/Discovering files/);
  });
});

// `lyse share > summary.md` produced an empty file. The markdown only reached
// stdout in the clipboard-FAILURE branch; on success it went to the clipboard
// and the confirmation went to a stderr spinner. Redirecting stdout — the one
// thing a "share" command exists for — captured nothing, and in CI the command
// wrote zero bytes and exited 0.
describe("runShare: stdout", () => {
  it("writes the markdown to stdout when stdout is redirected", async () => {
    const dir = makeFixture();
    const out: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      out.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    }) as typeof process.stdout.write;
    const origIsTTY = process.stdout.isTTY;
    (process.stdout as { isTTY?: boolean }).isTTY = false;
    try {
      await runShare(dir, {});
    } finally {
      process.stdout.write = origWrite;
      (process.stdout as { isTTY?: boolean }).isTTY = origIsTTY;
    }
    expect(out.join("")).toContain("Lyse");
  });

  it("keeps the terminal clean when stdout is a TTY (clipboard is the payload there)", async () => {
    const dir = makeFixture();
    const out: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      out.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    }) as typeof process.stdout.write;
    const origIsTTY = process.stdout.isTTY;
    (process.stdout as { isTTY?: boolean }).isTTY = true;
    try {
      await runShare(dir, {});
    } finally {
      process.stdout.write = origWrite;
      (process.stdout as { isTTY?: boolean }).isTTY = origIsTTY;
    }
    expect(out.join("")).toBe("");
  });
});
