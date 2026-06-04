import type { VerifierCorpus, FileOffset, CanonicalSample } from "./types.js";

export interface VerifierCorpusInput {
  files: ReadonlyArray<CanonicalSample>;
}

export function buildVerifierCorpus(input: VerifierCorpusInput): VerifierCorpus {
  const offsets: FileOffset[] = [];
  let cursor = 0;
  let corpus = "";
  for (const file of input.files) {
    const byteLen = Buffer.byteLength(file.content, "utf8");
    offsets.push({ path: file.path, start: cursor, end: cursor + byteLen });
    corpus += file.content;
    cursor += byteLen;
  }
  return { totalBytes: cursor, fileOffsets: offsets, corpus };
}
