import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GoldenRepo } from "./corpus.js";

const run = promisify(execFile);

export function goldenCacheDir(): string {
  return process.env.LYSE_GOLDEN_CACHE ?? join(tmpdir(), "lyse-golden-corpus");
}

// Fetches a pinned repo tarball via codeload and extracts it to a SHA-keyed cache dir.
// Returns the extracted repo root, or null when the network/tar is unavailable (offline dev).
export async function fetchGoldenRepo(repo: GoldenRepo): Promise<string | null> {
  const dest = join(goldenCacheDir(), `${repo.slug.replace("/", "__")}-${repo.sha}`);
  if (existsSync(dest)) return dest;
  // Extract into a temp sibling dir and only promote to `dest` on full success, so a
  // transient network/tar failure never leaves a poisoned empty cache dir behind
  // (existsSync(dest) above would otherwise short-circuit every later call to null).
  const tmp = `${dest}.partial`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    const archive = join(tmp, "archive.tgz");
    // No shell involved (argv-only execFile calls) — avoids re-introducing shell parsing.
    await run("curl", ["-fsSL", "-o", archive, repo.url], { maxBuffer: 512 * 1024 * 1024 });
    // codeload tar.gz has a single top-level dir "<repo>-<sha>/"; strip it.
    await run("tar", ["-xz", "--strip-components=1", "-C", tmp, "-f", archive], {
      maxBuffer: 512 * 1024 * 1024,
    });
    rmSync(archive, { force: true });
    renameSync(tmp, dest);
    return dest;
  } catch {
    rmSync(tmp, { recursive: true, force: true });
    return null; // offline or fetch failure → caller skips, no poisoned cache left behind
  }
}
