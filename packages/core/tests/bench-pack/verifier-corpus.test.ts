import { describe, it, expect } from "vitest";
import { buildVerifierCorpus } from "../../src/bench/evidence-pack/verifier-corpus.js";

describe("buildVerifierCorpus", () => {
  it("concatenates samples and emits offset map", () => {
    const samples = [
      { path: "a.txt", sha256: "x", byteCount: 5, content: "hello" },
      { path: "b.txt", sha256: "y", byteCount: 5, content: "world" },
    ];
    const c = buildVerifierCorpus({ files: samples });
    expect(c.totalBytes).toBe(10);
    expect(c.corpus).toBe("helloworld");
    expect(c.fileOffsets).toEqual([
      { path: "a.txt", start: 0, end: 5 },
      { path: "b.txt", start: 5, end: 10 },
    ]);
  });

  it("returns empty corpus when no files", () => {
    const c = buildVerifierCorpus({ files: [] });
    expect(c.totalBytes).toBe(0);
    expect(c.corpus).toBe("");
    expect(c.fileOffsets).toEqual([]);
  });

  it("computes offsets in bytes (UTF-8), not characters", () => {
    const samples = [
      { path: "a.txt", sha256: "x", byteCount: 4, content: "café" },
    ];
    const c = buildVerifierCorpus({ files: samples });
    expect(c.totalBytes).toBe(Buffer.byteLength("café", "utf8"));
    expect(c.fileOffsets[0]?.end).toBe(Buffer.byteLength("café", "utf8"));
  });
});
