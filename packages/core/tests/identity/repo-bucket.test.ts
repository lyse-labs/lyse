import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeRepoBucket, normalizeRemoteUrl, BUCKET_SALT } from "../../src/identity/repo-bucket.js";

let _repoCounter = 0;

function setupGitRepo(prefix: string, remoteUrl: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  execSync("git init -q", { cwd: dir });
  execSync('git config user.email "test@test"', { cwd: dir });
  execSync('git config user.name "test"', { cwd: dir });
  execSync(`git remote add origin ${remoteUrl}`, { cwd: dir });
  // Unique content per repo so each first commit has a distinct SHA.
  writeFileSync(join(dir, "README.md"), `repo-${_repoCounter++}-${Date.now()}-${Math.random()}\n`);
  execSync("git add .", { cwd: dir });
  execSync('git commit -q -m "initial"', { cwd: dir });
  return dir;
}

describe("normalizeRemoteUrl", () => {
  it("normalizes SSH style", () => {
    expect(normalizeRemoteUrl("git@github.com:acme/repo.git")).toBe("github.com/acme/repo");
  });

  it("normalizes HTTPS with user:token", () => {
    expect(normalizeRemoteUrl("https://user:token@github.com/acme/repo.git")).toBe("github.com/acme/repo");
  });

  it("normalizes HTTPS without auth", () => {
    expect(normalizeRemoteUrl("https://github.com/acme/repo")).toBe("github.com/acme/repo");
  });

  it("lowercases the result", () => {
    expect(normalizeRemoteUrl("https://github.com/ACME/Repo.git")).toBe("github.com/acme/repo");
  });

  it("strips .git suffix and trailing slash", () => {
    expect(normalizeRemoteUrl("https://github.com/acme/repo.git/")).toBe("github.com/acme/repo");
  });
});

describe("computeRepoBucket", () => {
  let repoA1: string;
  let repoA2: string; // same remote as A1, different first commit (fork-like)
  let repoB: string; // different remote

  beforeAll(() => {
    repoA1 = setupGitRepo("lyse-bucket-a1-", "https://github.com/acme/app.git");
    repoA2 = setupGitRepo("lyse-bucket-a2-", "https://github.com/acme/app.git");
    repoB = setupGitRepo("lyse-bucket-b-", "https://github.com/other/repo.git");
  });

  it("returns null when repoRoot has no .git directory", () => {
    expect(computeRepoBucket(tmpdir())).toBeNull();
  });

  it("returns a 16-char hex string for a valid git repo", () => {
    const bucket = computeRepoBucket(repoA1);
    expect(bucket).toMatch(/^[a-f0-9]{16}$/);
  });

  it("is deterministic across calls", () => {
    const a = computeRepoBucket(repoA1);
    const b = computeRepoBucket(repoA1);
    expect(a).toBe(b);
  });

  it("different first-commit SHA produces different bucket (even with same remote)", () => {
    // repoA1 and repoA2 have the same remote URL but different first commits (different timestamps).
    const a = computeRepoBucket(repoA1);
    const b = computeRepoBucket(repoA2);
    expect(a).not.toBe(b);
  });

  it("different remote URL produces different bucket", () => {
    const a = computeRepoBucket(repoA1);
    const b = computeRepoBucket(repoB);
    expect(a).not.toBe(b);
  });

  it("different salt produces different bucket", () => {
    const a = computeRepoBucket(repoA1);
    const b = computeRepoBucket(repoA1, { salt: "different-salt" });
    expect(a).not.toBe(b);
  });

  it("BUCKET_SALT is defined and matches the spec format", () => {
    expect(BUCKET_SALT).toMatch(/^lyse-v\d+-\d{4}Q[1-4]$/);
  });
});
