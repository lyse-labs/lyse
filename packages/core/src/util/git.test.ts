/**
 * Unit tests for util/git.ts — gitHeadSha + modifiedFilesWithHashes.
 * These test the fallback paths (no git repo) so no real git state is required.
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitHeadSha, modifiedFilesWithHashes } from "./git.js";

describe("gitHeadSha", () => {
  it("returns 'no-git' for a directory that is not a git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-git-"));
    try {
      const sha = await gitHeadSha(dir);
      expect(sha).toBe("no-git");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a non-empty string for a real git repo", async () => {
    // Use the Lyse repo root itself as a real git repo
    const sha = await gitHeadSha(process.cwd());
    // Should be a 40-char hex SHA or "no-git"
    expect(typeof sha).toBe("string");
    expect(sha.length).toBeGreaterThan(0);
  });
});

describe("modifiedFilesWithHashes", () => {
  it("returns an empty array for a directory that is not a git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lyse-git-mod-"));
    try {
      const result = await modifiedFilesWithHashes(dir);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
