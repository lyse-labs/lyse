import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
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
  mkdirSync(dest, { recursive: true });
  try {
    // codeload tar.gz has a single top-level dir "<repo>-<sha>/"; strip it.
    await run("bash", ["-c",
      `curl -fsSL "${repo.url}" | tar -xz --strip-components=1 -C "${dest}"`,
    ], { maxBuffer: 512 * 1024 * 1024 });
    return dest;
  } catch {
    return null; // offline or fetch failure → caller skips
  }
}
