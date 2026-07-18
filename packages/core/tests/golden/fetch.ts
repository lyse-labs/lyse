import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
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
  // Extract into a per-call unique temp dir (not a shared `${dest}.partial`) so two
  // concurrent callers racing for the same cold `dest` (e.g. fetch.test.ts and
  // golden.test.ts run in parallel vitest workers, both auditing GOLDEN_CORPUS[0]) each
  // get their own scratch space instead of one worker's rmSync/renameSync clobbering the
  // other's in-progress download.
  mkdirSync(goldenCacheDir(), { recursive: true });
  const tmp = mkdtempSync(join(goldenCacheDir(), `${repo.sha}.`));
  try {
    const archive = join(tmp, "archive.tgz");
    // No shell involved (argv-only execFile calls) — avoids re-introducing shell parsing.
    await run("curl", ["-fsSL", "-o", archive, repo.url]);
    // codeload tar.gz has a single top-level dir "<repo>-<sha>/"; strip it.
    await run("tar", ["-xz", "--strip-components=1", "-C", tmp, "-f", archive]);
    rmSync(archive, { force: true });
    try {
      renameSync(tmp, dest);
    } catch {
      // A concurrent caller already promoted its own tmp dir to `dest` first — use theirs
      // (both extracted the same pinned SHA, so the contents are equivalent) and discard ours.
      rmSync(tmp, { recursive: true, force: true });
    }
    return dest;
  } catch {
    rmSync(tmp, { recursive: true, force: true });
    return null; // offline or fetch failure → caller skips, no poisoned cache left behind
  }
}
