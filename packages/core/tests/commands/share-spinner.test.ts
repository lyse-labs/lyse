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
    expect(all).toMatch(/score \d+\/100/);
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
