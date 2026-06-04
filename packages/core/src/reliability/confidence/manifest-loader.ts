import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { ConfidenceManifest } from "../types.js";

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

export interface LoadManifestOpts {
  url: string;
  fallback: ConfidenceManifest;
  pinnedDate?: string;
  cacheDir?: string;
}

// Honors LYSE_CACHE_DIR env override for CI / testing; defaults to ~/.cache/lyse.
function resolveCacheFile(cacheDir?: string): string {
  const dir = cacheDir ?? process.env["LYSE_CACHE_DIR"] ?? resolve(homedir(), ".cache", "lyse");
  return resolve(dir, "manifest.json");
}

async function readFreshCache(cacheFile: string): Promise<ConfidenceManifest | null> {
  if (!existsSync(cacheFile)) return null;
  try {
    const s = await stat(cacheFile);
    if (Date.now() - s.mtimeMs >= TTL_MS) return null;
    const raw = await readFile(cacheFile, "utf8");
    return JSON.parse(raw) as ConfidenceManifest;
  } catch {
    return null;
  }
}

async function writeCache(cacheFile: string, manifest: ConfidenceManifest): Promise<void> {
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    await writeFile(cacheFile, JSON.stringify(manifest), "utf8");
  } catch {
    // Read-only filesystem must not break the loader.
  }
}

export async function loadManifest(opts: LoadManifestOpts): Promise<ConfidenceManifest> {
  const cacheFile = resolveCacheFile(opts.cacheDir);

  const cached = await readFreshCache(cacheFile);
  if (cached) return cached;

  try {
    const url = opts.pinnedDate ? `${opts.url}?pinned=${opts.pinnedDate}` : opts.url;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = (await res.json()) as ConfidenceManifest;
    await writeCache(cacheFile, manifest);
    return manifest;
  } catch {
    return opts.fallback;
  }
}
