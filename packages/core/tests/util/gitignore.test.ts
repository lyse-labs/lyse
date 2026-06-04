import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureGitignoreEntry } from "../../src/util/gitignore.js";

describe("ensureGitignoreEntry", () => {
  let tmpDir: string;
  let gitDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "lyse-test-"));
    gitDir = join(tmpDir, ".git");
    await mkdir(gitDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates .gitignore with entry when file does not exist", async () => {
    await ensureGitignoreEntry(tmpDir, ".lyse/");

    const content = await readFile(join(tmpDir, ".gitignore"), "utf8");
    expect(content).toContain(".lyse/");
  });

  it("appends entry when .gitignore exists but entry is missing", async () => {
    const gitignorePath = join(tmpDir, ".gitignore");
    await writeFile(gitignorePath, "node_modules/\n");

    await ensureGitignoreEntry(tmpDir, ".lyse/");

    const content = await readFile(gitignorePath, "utf8");
    expect(content).toContain("node_modules/");
    expect(content).toContain(".lyse/");
  });

  it("is idempotent when entry already exists", async () => {
    const gitignorePath = join(tmpDir, ".gitignore");
    await writeFile(gitignorePath, ".lyse/\n");

    await ensureGitignoreEntry(tmpDir, ".lyse/");

    const content = await readFile(gitignorePath, "utf8");
    // Should not add a second copy
    expect(content.match(/\.lyse\//g)?.length).toBe(1);
  });

  it("handles entry with and without trailing slash consistently", async () => {
    const gitignorePath = join(tmpDir, ".gitignore");
    await writeFile(gitignorePath, ".lyse/\n");

    // Try to add without trailing slash
    await ensureGitignoreEntry(tmpDir, ".lyse");

    const content = await readFile(gitignorePath, "utf8");
    // Should recognize .lyse/ and .lyse as the same
    expect(content.match(/\.lyse\/?/g)?.length).toBe(1);
  });

  it("is a no-op when not in a git repo", async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), "lyse-test-no-git-"));
    try {
      const gitignorePath = join(nonGitDir, ".gitignore");

      // Should not create .gitignore when no .git/ directory exists
      await ensureGitignoreEntry(nonGitDir, ".lyse/");

      // File should not be created
      let exists = false;
      try {
        await readFile(gitignorePath, "utf8");
        exists = true;
      } catch {
        exists = false;
      }
      expect(exists).toBe(false);
    } finally {
      await rm(nonGitDir, { recursive: true, force: true });
    }
  });

  it("includes Lyse comment when creating new entry", async () => {
    await ensureGitignoreEntry(tmpDir, ".lyse/");

    const content = await readFile(join(tmpDir, ".gitignore"), "utf8");
    expect(content).toContain("# Lyse local cache");
  });
});
